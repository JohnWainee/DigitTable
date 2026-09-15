import type { StableErrorCode } from "./errors.js";
import type { Capability } from "./template.js";
import type { RoomId } from "./ids.js";

/**
 * A02 (docs/reviews issue #14 board): the client-facing integration contract
 * for creating and joining a room, published early so Sonnet B and C can
 * build against a stable shape while A03 (secure `createRoom`) and the rest
 * of A01's admission boundary (PR #13, `packages/contracts/src/admission.ts`)
 * land in their own PRs. Naming here deliberately mirrors PR #13's
 * `AdmitMemberInput`/`ClaimSeatInput`/`AdmissionAccepted` conventions
 * (bounded strings, `requestedCapability`, a single `recoveryCode` shown
 * once) so the two merge without a redesign. Where this module needs a type
 * PR #13 already owns (the untrusted admission payload shapes themselves),
 * it stays deliberately narrow and does not redeclare them.
 */

/**
 * The human-typed room locator (docs/ARCHITECTURE.md section 8). Kept as a
 * plain string, not a branded type, to match `AdmitMemberInput.roomCode` in
 * `./admission.js` once PR #13 merges — a brand here would force a cast at
 * every boundary between the two.
 */
export type RoomCode = string;

/**
 * A client-minted idempotency key for a pre-membership request (create a
 * room, join, or claim the GM seat). Deliberately a distinct concept from
 * `CommandId` (`./ids.js`): a `CommandId` is minted by an already-admitted
 * member for a game command against `authority/current`; a `RequestId` is
 * minted before any membership exists, by a caller who does not yet have a
 * `memberId`, `roomId`, or trusted capability. Reused verbatim across
 * retries so a resubmission (double-click, dropped response) reaches the
 * idempotent-retry path instead of provisioning a duplicate room or seat
 * (docs/PHASE_2_PLAN.md PR 3 residual R4; board task A03).
 */
export type RequestId = string;

const MIN_SECRET_LENGTH = 4;
const MAX_PASSPHRASE_LENGTH = 128;
const MAX_DISPLAY_NAME_LENGTH = 40;
const MAX_SESSION_NAME_LENGTH = 60;
const MIN_REQUEST_ID_LENGTH = 8;
const MAX_REQUEST_ID_LENGTH = 128;

/**
 * Untrusted input for A03's `createRoom` callable. The creator always
 * becomes the bound GM seat; there is no separate "requested capability"
 * the way `AdmitMemberInput` has one.
 */
export interface CreateRoomInput {
  readonly requestId: RequestId;
  readonly sessionName: string;
  readonly passphrase: string;
  readonly creatorDisplayName: string;
}

/**
 * Untrusted input for a join-by-code request. Mirrors PR #13's
 * `AdmitMemberInput` field-for-field (`requestedCapability` excludes
 * `"gm"` for the same reason: a GM seat is claimed, never admitted) plus
 * the `requestId` idempotency key A03/A05 need for retry-safe dispatch.
 */
export interface JoinRoomInput {
  readonly requestId: RequestId;
  readonly roomCode: RoomCode;
  readonly passphrase: string;
  readonly requestedCapability: Exclude<Capability, "gm">;
  readonly displayName: string;
}

/** Untrusted input to claim the single GM seat, mirroring `ClaimSeatInput`. */
export interface ClaimGmSeatInput {
  readonly requestId: RequestId;
  readonly roomCode: RoomCode;
  readonly passphrase: string;
  readonly displayName: string;
}

/**
 * The accepted outcome shared by createRoom/joinRoom/claimGmSeat. Field
 * names match PR #13's `AdmissionAccepted` so the two are structurally the
 * same shape once merged; `roomId` and `roomCode` are added because a
 * pre-membership caller does not otherwise learn either.
 */
export interface RoomAdmissionAccepted {
  readonly ok: true;
  readonly roomId: RoomId;
  readonly roomCode: RoomCode;
  readonly memberId: string;
  readonly capability: Capability;
  /**
   * Non-null only when a new seat was just created by this request; a
   * reclaim by an already-bound identity never re-mints or re-exposes a
   * credential (docs/ARCHITECTURE.md section 8). Never persisted outside
   * the client that received it, never placed in a URL or shared document.
   */
  readonly recoveryCode: string | null;
  readonly roomRevision: number;
}

/** A rejected admission/creation request. Carries only what is safe to show a caller. */
export interface RoomAdmissionRejected {
  readonly ok: false;
  readonly code: StableErrorCode;
  readonly message: string;
}

export type CreateRoomResult = RoomAdmissionAccepted | RoomAdmissionRejected;
export type JoinRoomResult = RoomAdmissionAccepted | RoomAdmissionRejected;
export type ClaimGmSeatResult = RoomAdmissionAccepted | RoomAdmissionRejected;

/**
 * Which screen a capability routes to. Kept as a named indirection (rather
 * than using `Capability` directly as the route) so a future divergence
 * (e.g. a spectator capability that still routes to the table screen) is a
 * one-line change here instead of a search-and-replace across C's router.
 */
export type ViewerRoute = "player" | "gm" | "table";

export function viewerRouteForCapability(capability: Capability): ViewerRoute {
  return capability;
}

/**
 * Client-side lifecycle of one outstanding pre-membership request
 * (create/join/claim) or, reused as-is, one dispatched game command
 * (board tasks C01 "pending/retry/error states" and C02 "accepted/pending/
 * rejected/disconnected states"). `requestId` is always present so the UI
 * can tell a stale response from the current attempt after a retry.
 */
export type SessionRequestState<TAccepted extends { readonly ok: true }> =
  | { readonly status: "idle" }
  | { readonly status: "pending"; readonly requestId: RequestId }
  | { readonly status: "accepted"; readonly requestId: RequestId; readonly result: TAccepted }
  | {
      readonly status: "rejected";
      readonly requestId: RequestId;
      readonly code: StableErrorCode;
      readonly message: string;
    }
  /**
   * The request may or may not have reached the trusted handler before the
   * connection dropped (A06 "handle disconnect after acceptance before
   * response"). The UI must not assume either outcome and must not mint a
   * fresh `requestId` to retry — reusing the same one is what makes the
   * eventual retry idempotent.
   */
  | { readonly status: "disconnected"; readonly requestId: RequestId };

export function idleSessionRequest<
  TAccepted extends { readonly ok: true },
>(): SessionRequestState<TAccepted> {
  return { status: "idle" };
}

/**
 * What a browser tab persists locally (never server-side, never in a URL)
 * to resume a seat after a reload — "ownership" in the board's sense (A02:
 * "viewer routing, ownership"). `recoveryCode` is carried here only until
 * A06's reconnect flow trades it for a fresh session; it is never sent
 * anywhere except the recovery callable that consumes it.
 */
export interface SessionOwnershipRecord {
  readonly roomId: RoomId;
  readonly roomCode: RoomCode;
  readonly memberId: string;
  readonly capability: Capability;
  readonly recoveryCode: string | null;
}

export function ownershipFromAccepted(accepted: RoomAdmissionAccepted): SessionOwnershipRecord {
  return {
    roomId: accepted.roomId,
    roomCode: accepted.roomCode,
    memberId: accepted.memberId,
    capability: accepted.capability,
    recoveryCode: accepted.recoveryCode,
  };
}

// -- Runtime validation (fail closed on malformed input; never defaults) --

export class SessionInputError extends Error {}

function fail(where: string, detail: string): never {
  throw new SessionInputError(`session input: ${where}: ${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectBoundedString(
  value: unknown,
  where: string,
  { min = 0, max }: { readonly min?: number; readonly max: number },
): string {
  if (typeof value !== "string") fail(where, `expected string, got ${typeof value}`);
  if (value.length < min || value.length > max) {
    fail(where, `expected length between ${min} and ${max}, got ${value.length}`);
  }
  return value;
}

function expectRequestId(value: unknown): RequestId {
  return expectBoundedString(value, "requestId", {
    min: MIN_REQUEST_ID_LENGTH,
    max: MAX_REQUEST_ID_LENGTH,
  });
}

function expectDisplayName(value: unknown): string {
  const name = expectBoundedString(value, "displayName", { min: 1, max: MAX_DISPLAY_NAME_LENGTH });
  if (name.trim().length === 0) fail("displayName", "expected a visible character");
  return name;
}

function expectPassphrase(value: unknown): string {
  return expectBoundedString(value, "passphrase", {
    min: MIN_SECRET_LENGTH,
    max: MAX_PASSPHRASE_LENGTH,
  });
}

/** Runtime-validates untrusted `createRoom` input. Never defaults a missing field. */
export function parseCreateRoomInput(value: unknown): CreateRoomInput {
  if (!isRecord(value)) fail("root", "expected an object");
  return {
    requestId: expectRequestId(value.requestId),
    sessionName: expectBoundedString(value.sessionName, "sessionName", {
      min: 1,
      max: MAX_SESSION_NAME_LENGTH,
    }),
    passphrase: expectPassphrase(value.passphrase),
    creatorDisplayName: expectDisplayName(value.creatorDisplayName),
  };
}
