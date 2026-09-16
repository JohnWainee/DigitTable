import type { AdmissionStatus, AuthorityRecord, RoomStatus } from "./authority.js";
import type { CommandId, MemberId, ReceiptId, RoomId } from "./ids.js";
import { asMemberId, asRoomId } from "./ids.js";
import type { Capability } from "./template.js";
import type { VersionedTemplateRecord } from "./versions.js";

const CAPABILITIES: readonly Capability[] = ["player", "gm", "table"];

/** Client-readable mirror of room lifecycle metadata at `meta/current`. */
export interface RoomMetaDocument extends VersionedTemplateRecord {
  readonly roomStatus: RoomStatus;
  readonly gmMemberId: MemberId | null;
  readonly createdAtServer: string;
  readonly updatedAtServer: string;
}

/** Client-readable roster entry at `members/{memberId}`. */
export interface RoomMemberDocument {
  readonly memberId: MemberId;
  readonly capability: Capability;
  readonly displayName: string;
  readonly joinedAtServer: string;
  readonly lastSeenAtServer: string;
}

/** Service-only stable-seat binding at `bindings/{memberId}`. */
export interface MemberBindingDocument {
  readonly memberId: MemberId;
  readonly uid: string;
  readonly capability: Capability;
}

/**
 * Service-only rules lookup at `uidBindings/{uid}`. Its two fields are the
 * authorization contract consumed by Firestore rules, so writers must never
 * spell them independently (Phase 2 PR 2 review S6).
 */
export interface UidBindingDocument {
  readonly memberId: MemberId;
  readonly capability: Capability;
}

/** Actor-private command outcome at `receipts/{memberId}_{commandId}`. */
export interface CommandReceiptDocument {
  readonly receiptId: ReceiptId;
  readonly memberId: MemberId;
  readonly commandId: CommandId;
  readonly status: "accepted" | "rejected";
  readonly acceptedSequence: number | null;
  readonly roomRevision: number;
}

/** Service-only archival copy at `snapshots/{sequence}`. */
export interface SnapshotDocument<TState> {
  readonly sequence: number;
  readonly checksum: string;
  readonly authority: AuthorityRecord<TState>;
}

/** Service-only code index at `roomCodes/{code}`. Code material never appears here. */
export interface RoomCodeDocument {
  readonly roomId: RoomId;
}

/**
 * Service-only salted-hash record. Shared shape for the room passphrase
 * (`rooms/{roomId}/admission/secret`) and per-seat recovery codes
 * (`rooms/{roomId}/recovery/{memberId}`, Phase 2 PR 3) — both are "shown or
 * set once, verified many times" secrets per docs/ARCHITECTURE.md section 8,
 * never stored or logged in plaintext.
 */
export interface HashedSecretDocument {
  readonly hash: string;
  readonly salt: string;
  readonly iterations: number;
}

/** Service-only room passphrase at `rooms/{roomId}/admission/secret`. Gates `player`/`gm` admission. */
export type RoomAdmissionSecretDocument = HashedSecretDocument;

/**
 * Service-only table code at `rooms/{roomId}/admission/tableSecret`
 * (docs/ARCHITECTURE.md section 8: "A `table` seat ... The GM admits it
 * using a separate table code."). A distinct secret from
 * `RoomAdmissionSecretDocument` — knowing the room's general
 * code-plus-passphrase must never be sufficient to claim the exclusive
 * table seat.
 */
export type RoomTableSecretDocument = HashedSecretDocument;

/** Service-only per-seat recovery credential at `rooms/{roomId}/recovery/{memberId}`. */
export interface RecoveryCredentialDocument extends HashedSecretDocument {
  readonly memberId: MemberId;
}

/** Upper bound accepted for a stored PBKDF2 iteration count (the authority hashes at 210,000). */
export const MAX_SECRET_ITERATIONS = 1_000_000;

/**
 * Service-only admission rate-limit counter (Phase 2 PR 3 review:
 * "meaningful per-IP/per-room throttling"). Three fixed-window buckets live
 * under the `admissionThrottle` collection, keyed by SHA-256 of the untrusted
 * value so no submitted code or address is stored as a document ID:
 * per `(submitted room code, caller IP)` — passphrase brute force against
 * one code; per caller IP — code enumeration; and per verified anonymous
 * UID — an unspoofable bound that holds even where the IP is not
 * trustworthy (second pass, T1/C1/C6). Kept outside `rooms/{roomId}` so
 * guesses at codes that resolve to no room are bounded too. A fixed-window
 * counter, not a token bucket: simple enough to reason about correctness
 * under concurrent transactions. The authority also writes an `expiresAt`
 * timestamp (not part of this contract) for a Firestore TTL policy.
 */
export interface AdmissionThrottleDocument {
  readonly windowStartMs: number;
  readonly count: number;
}

/** Canonical Firestore document identifier from the architecture's R6 decision. */
export function receiptIdFor(memberId: MemberId, commandId: CommandId): ReceiptId {
  return `${memberId}_${commandId}` as ReceiptId;
}

/**
 * Thrown by the `parse*Document` functions below when a persisted document
 * exists but fails runtime validation. Every reader of a persisted
 * authority/room-code/binding/secret document must treat this as a deny,
 * never as license to substitute a permissive default — malformed data must
 * never read as active/open/zero-capacity (Phase 2 PR 3 review).
 */
export class RoomDataError extends Error {}

function fail(where: string): never {
  throw new RoomDataError(`room data: ${where}: malformed or missing`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The subset of `authority/current` the admission authority reads and writes. */
export interface AuthorityAdmissionFields {
  readonly roomStatus: RoomStatus;
  readonly admissionStatus: AdmissionStatus;
  readonly participantCount: number;
  readonly tableSeatClaimed: boolean;
  readonly gmMemberId: MemberId | null;
}

/**
 * Runtime-validates `authority/current`'s admission-relevant fields.
 * Fails closed: an unrecognized `roomStatus`/`admissionStatus`, a
 * non-integer/negative `participantCount`, or a non-boolean
 * `tableSeatClaimed` throws rather than defaulting to "active", "open", or
 * `0` — a defaulted-permissive read here would silently reopen a closed or
 * archived room, or under-report occupancy.
 */
export function parseAuthorityAdmissionFields(data: unknown): AuthorityAdmissionFields {
  if (!isRecord(data)) fail("authority/current");
  const { roomStatus, admissionStatus, participantCount, tableSeatClaimed, gmMemberId } = data;
  if (roomStatus !== "active" && roomStatus !== "archived") {
    fail("authority/current.roomStatus");
  }
  if (admissionStatus !== "open" && admissionStatus !== "closed") {
    fail("authority/current.admissionStatus");
  }
  if (
    typeof participantCount !== "number" ||
    !Number.isInteger(participantCount) ||
    participantCount < 0
  ) {
    fail("authority/current.participantCount");
  }
  if (typeof tableSeatClaimed !== "boolean") {
    fail("authority/current.tableSeatClaimed");
  }
  // The key must be present: an *absent* `gmMemberId` must never read as "no
  // GM seated" — that would let a corrupted authority document reopen the
  // exclusive GM seat (Phase 2 PR 3 second pass, T2/C4). Only `null` (seat
  // open) or a non-empty member ID is accepted.
  if (!("gmMemberId" in data)) fail("authority/current.gmMemberId");
  if (gmMemberId !== null && (typeof gmMemberId !== "string" || gmMemberId.length === 0)) {
    fail("authority/current.gmMemberId");
  }
  return {
    roomStatus,
    admissionStatus,
    participantCount,
    tableSeatClaimed,
    gmMemberId: typeof gmMemberId === "string" ? asMemberId(gmMemberId) : null,
  };
}

/** Runtime-validates `roomCodes/{code}`. Fails closed on a missing/empty `roomId`. */
export function parseRoomCodeDocument(data: unknown): RoomCodeDocument {
  if (!isRecord(data)) fail("roomCodes/{code}");
  const { roomId } = data;
  if (typeof roomId !== "string" || roomId.length === 0) {
    fail("roomCodes/{code}.roomId");
  }
  return { roomId: asRoomId(roomId) };
}

/**
 * Runtime-validates `uidBindings/{uid}`. Fails closed rather than treating a
 * corrupted binding as "no binding exists" — the latter would let a caller
 * whose binding failed to parse re-enter the `create` path and potentially
 * double-occupy a seat.
 */
export function parseUidBindingDocument(data: unknown): UidBindingDocument {
  if (!isRecord(data)) fail("uidBindings/{uid}");
  const { memberId, capability } = data;
  if (typeof memberId !== "string" || memberId.length === 0) {
    fail("uidBindings/{uid}.memberId");
  }
  if (!(CAPABILITIES as readonly string[]).includes(capability as string)) {
    fail("uidBindings/{uid}.capability");
  }
  return { memberId: asMemberId(memberId), capability: capability as Capability };
}

/**
 * Runtime-validates a `HashedSecretDocument` (`admission/secret`,
 * `admission/tableSecret`, or `recovery/{memberId}`). Fails closed: a
 * malformed secret document is treated as "cannot verify," which callers
 * must map to a failed passphrase check, never a bypassed one.
 */
export function parseHashedSecretDocument(data: unknown): HashedSecretDocument {
  if (!isRecord(data)) fail("secret document");
  const { hash, salt, iterations } = data;
  if (typeof hash !== "string" || hash.length === 0) fail("secret.hash");
  if (typeof salt !== "string" || salt.length === 0) fail("secret.salt");
  // Bounded above as well as below: a corrupted iteration count must not be
  // able to pin the authority's CPU on one verification (second pass, C10).
  if (
    typeof iterations !== "number" ||
    !Number.isInteger(iterations) ||
    iterations <= 0 ||
    iterations > MAX_SECRET_ITERATIONS
  ) {
    fail("secret.iterations");
  }
  return { hash, salt, iterations };
}

/**
 * Runtime-validates an `admissionThrottle/{roomCode}/byIp/{ip}` counter.
 * Fails closed: a malformed counter throws rather than being treated as a
 * fresh window, since "start a new window" is the permissive outcome.
 */
export function parseAdmissionThrottleDocument(data: unknown): AdmissionThrottleDocument {
  if (!isRecord(data)) fail("admissionThrottle");
  const { windowStartMs, count } = data;
  if (typeof windowStartMs !== "number" || !Number.isFinite(windowStartMs)) {
    fail("admissionThrottle.windowStartMs");
  }
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    fail("admissionThrottle.count");
  }
  return { windowStartMs, count };
}
