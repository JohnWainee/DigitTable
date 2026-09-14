import type { CommandId, MemberId, ReceiptId, RoomId } from "./ids.js";
import { asReceiptId } from "./ids.js";
import type { StableErrorCode } from "./errors.js";
import type { Capability } from "./template.js";
import type { VersionedTemplateRecord } from "./versions.js";

/**
 * `authority/current`'s and `meta/current`'s shared room-lifecycle fields
 * (docs/ARCHITECTURE.md section 8; third-pass review R2). `"archived"` rooms
 * remain readable per the documented 90-day retention policy but no longer
 * accept commands.
 */
export type RoomStatus = "active" | "archived";

/**
 * `rooms/{roomId}/meta/current`: a denormalized, client-readable mirror of
 * `authority/current`'s `roomStatus`/`gmMemberId`, kept in sync in the same
 * transaction that changes either (docs/ARCHITECTURE.md section 8). Clients
 * that only need to display room status/template subscribe here instead of
 * to the service-only `authority/current`.
 */
export interface RoomMetaDocument extends VersionedTemplateRecord {
  readonly roomStatus: RoomStatus;
  readonly gmMemberId: MemberId;
  readonly tableMemberId: MemberId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * `rooms/{roomId}/members/{memberId}`: the client-readable roster entry.
 * Carries no UID and no private data — that lives in `bindings`/`uidBindings`
 * and each member's own projection.
 */
export interface MemberDocument {
  readonly memberId: MemberId;
  readonly capability: Capability;
  readonly displayName: string;
  readonly joinedAt: string;
  readonly lastSeenAt: string;
}

/**
 * `rooms/{roomId}/bindings/{memberId}`: service-only and client-unreadable
 * (docs/ARCHITECTURE.md section 8). The member-keyed record Functions use to
 * resolve a member's current UID, e.g. to validate `uidBindings` stays in
 * sync with it.
 */
export interface BindingDocument {
  readonly memberId: MemberId;
  readonly uid: string;
  readonly capability: Capability;
}

/**
 * `rooms/{roomId}/uidBindings/{uid}`: the service-only reverse index
 * (third-pass review R1) that lets Firestore rules establish "is this UID a
 * member of this room, and as what" with one `get()`, since rules cannot
 * query `bindings` by UID. Written in the same transaction as
 * `bindings/{memberId}` on join, rebind, and kick.
 */
export interface UidBindingDocument {
  readonly memberId: MemberId;
  readonly capability: Capability;
}

/** `rooms/{roomId}/receipts/{receiptId}`'s outcome, mirroring `RunCommandResult`. */
export type ReceiptStatus = "accepted" | "rejected";

/**
 * `rooms/{roomId}/receipts/{receiptId}`: the actor-private stored result a
 * retried command's transaction returns instead of re-deciding
 * (docs/ARCHITECTURE.md section 8). `receiptId` is `${memberId}_${commandId}`
 * (third-pass review R6); `memberId` and `commandId` are repeated in the
 * document body so a client that already knows the ID can validate it, and
 * so Firestore rules can compare `resource.data.memberId` against the
 * reader's own bound member ID without parsing the document ID.
 */
export interface ReceiptDocument {
  readonly memberId: MemberId;
  readonly commandId: CommandId;
  readonly status: ReceiptStatus;
  readonly roomRevision: number | null;
  readonly acceptedSequences: readonly number[];
  readonly errorCode: StableErrorCode | null;
}

/** Builds the deterministic `receiptId` for a member/command pair (R6). */
export function receiptDocumentId(memberId: MemberId, commandId: CommandId): ReceiptId {
  return asReceiptId(`${memberId}_${commandId}`);
}

/**
 * `rooms/{roomId}/snapshots/{sequence}`: an archival, service-only copy of
 * `authority/current` taken before compaction. Never a reconstruction path
 * for command execution (docs/ARCHITECTURE.md section 8; `AGENTS.md`).
 */
export interface SnapshotDocument<TState> extends VersionedTemplateRecord {
  readonly sequence: number;
  readonly roomRevision: number;
  readonly state: TState;
  readonly checksum: string;
  readonly createdAt: string;
}

/** The two human-facing room-code kinds (docs/ARCHITECTURE.md section 8: "A table seat... admitted using a separate table code."). */
export type RoomCodeKind = "player" | "table";

/**
 * `roomCodes/{code}`: a top-level, service-only, rotatable locator from a
 * human-shareable code to a room. "Human room codes are locators, not
 * secrets" (docs/ARCHITECTURE.md section 8) — the code itself carries no
 * authorization; resolving it is a trusted Function's job (Phase 2 PR 3).
 */
export interface RoomCodeDocument {
  readonly roomId: RoomId;
  readonly kind: RoomCodeKind;
  readonly createdAt: string;
}

/** The three physical event-partition document IDs under `rooms/{roomId}/events/`. */
export const SHARED_EVENT_PARTITION_ID = "shared";
export const GM_EVENT_PARTITION_ID = "gm";

/** The member-private partition's document ID (docs/ARCHITECTURE.md section 8: `events/member-{memberId}/items/{sequence}`). */
export function memberEventPartitionId(memberId: MemberId): string {
  return `member-${memberId}`;
}
