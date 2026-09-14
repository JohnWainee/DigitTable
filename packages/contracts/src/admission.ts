import type { Capability } from "./template.js";

/** Cap room membership at eight participant seats (docs/ARCHITECTURE.md section 11). */
export const MAX_PARTICIPANT_SEATS = 8;

const MIN_SECRET_LENGTH = 4;
const MAX_ROOM_CODE_LENGTH = 32;
const MAX_PASSPHRASE_LENGTH = 128;
const MAX_DISPLAY_NAME_LENGTH = 40;

const ADMIT_MEMBER_CAPABILITIES = ["player", "table"] as const;

/**
 * Untrusted join input submitted to the admission authority. The authority
 * resolves the room code and creates the stable seat; neither a room ID nor a
 * member ID is client-asserted here.
 */
export interface AdmitMemberInput {
  readonly roomCode: string;
  readonly passphrase: string;
  readonly requestedCapability: Exclude<Capability, "gm">;
  readonly displayName: string;
}

/** Untrusted request to claim the single GM seat for a room reached by code. */
export interface ClaimSeatInput {
  readonly roomCode: string;
  readonly passphrase: string;
  readonly displayName: string;
}

/** Platform-owned room lifecycle commands; these never enter a game template. */
export type AdmissionCommand =
  | { readonly type: "AdmitMember"; readonly input: AdmitMemberInput }
  | { readonly type: "ClaimSeat"; readonly input: ClaimSeatInput };

/**
 * Result returned once a trusted authority has resolved a join/claim
 * request. `recoveryCode` is non-null only when a new seat was just created;
 * a reclaim by an already-bound identity (the same UID reconnecting) never
 * re-mints or re-exposes a credential, since it is shown exactly once at
 * creation (docs/ARCHITECTURE.md section 8).
 */
export interface AdmissionAccepted {
  readonly memberId: string;
  readonly capability: Capability;
  readonly recoveryCode: string | null;
}

class AdmissionInputError extends Error {}

function fail(where: string, detail: string): never {
  throw new AdmissionInputError(`admission input: ${where}: ${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Bounds-checked string extraction. Untrusted browser input never reaches
 * the pure admission decision or a hash comparison without first passing
 * through this — an unbounded string is itself a payload-size abuse vector
 * distinct from `PAYLOAD_TOO_LARGE` (this rejects before any Firestore read).
 */
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

function expectAdmitCapability(value: unknown, where: string): Exclude<Capability, "gm"> {
  if (
    typeof value !== "string" ||
    !(ADMIT_MEMBER_CAPABILITIES as readonly string[]).includes(value)
  ) {
    fail(where, `expected one of ${ADMIT_MEMBER_CAPABILITIES.join(", ")}, got ${String(value)}`);
  }
  // A GM seat is never requestable through AdmitMember, even if a client
  // sends the literal string "gm" — narrowed by the allow-list check above,
  // not by trusting the declared input type at runtime.
  return value as Exclude<Capability, "gm">;
}

/**
 * Runtime-validates untrusted `AdmitMember` input. Browser values are
 * untrusted regardless of what the TypeScript type claims; this is the
 * boundary that actually enforces "no GM seat via AdmitMember" and bounds
 * every string before it reaches a hash comparison or Firestore write.
 */
export function parseAdmitMemberInput(value: unknown): AdmitMemberInput {
  if (!isRecord(value)) fail("root", "expected an object");
  return {
    roomCode: expectBoundedString(value.roomCode, "roomCode", {
      min: MIN_SECRET_LENGTH,
      max: MAX_ROOM_CODE_LENGTH,
    }),
    passphrase: expectBoundedString(value.passphrase, "passphrase", {
      min: MIN_SECRET_LENGTH,
      max: MAX_PASSPHRASE_LENGTH,
    }),
    requestedCapability: expectAdmitCapability(value.requestedCapability, "requestedCapability"),
    displayName: expectBoundedString(value.displayName, "displayName", {
      min: 1,
      max: MAX_DISPLAY_NAME_LENGTH,
    }),
  };
}

/** Runtime-validates untrusted `ClaimSeat` input; see `parseAdmitMemberInput`. */
export function parseClaimSeatInput(value: unknown): ClaimSeatInput {
  if (!isRecord(value)) fail("root", "expected an object");
  return {
    roomCode: expectBoundedString(value.roomCode, "roomCode", {
      min: MIN_SECRET_LENGTH,
      max: MAX_ROOM_CODE_LENGTH,
    }),
    passphrase: expectBoundedString(value.passphrase, "passphrase", {
      min: MIN_SECRET_LENGTH,
      max: MAX_PASSPHRASE_LENGTH,
    }),
    displayName: expectBoundedString(value.displayName, "displayName", {
      min: 1,
      max: MAX_DISPLAY_NAME_LENGTH,
    }),
  };
}
