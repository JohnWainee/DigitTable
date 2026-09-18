/**
 * Board task A06: seat recovery ("Redemption" in docs/ARCHITECTURE.md
 * section 8) — an identity that lost its browser session (cleared storage,
 * new device, signed out) rebinds its seat using the recovery code shown
 * once at admission, without the GM's involvement. Untrusted request and
 * accepted-result shapes for the `recoverSeat` callable; the transaction
 * itself lives in `apps/functions/src/recoverySeatAuthority.ts`.
 */

const MIN_SECRET_LENGTH = 4;
const MAX_ROOM_CODE_LENGTH = 32;
const MAX_RECOVERY_CODE_LENGTH = 64;

/** Matches `packages/contracts/src/admission.ts`'s room-code pattern exactly — the same locator, the same path-safety reasoning. */
const ROOM_CODE_PATTERN = /^[A-Za-z0-9-]+$/;

/**
 * Untrusted redemption request. Deliberately does *not* carry a `memberId`
 * or `capability` — the server determines which seat the code belongs to
 * by checking it against every seated member's `recovery/{memberId}` hash
 * in the room (bounded at `MAX_PARTICIPANT_SEATS + 1`, `admission.ts`); a
 * client-asserted `memberId` would let one caller probe whether an
 * arbitrary member ID exists without ever proving they hold that seat's
 * code.
 */
export interface RecoverSeatInput {
  readonly roomCode: string;
  readonly recoveryCode: string;
}

/**
 * Result of a successful redemption. `recoveryCode` is the *freshly minted*
 * replacement — the redeemed code is invalidated in the same transaction
 * (docs/ARCHITECTURE.md section 8: "invalidates the code"), so the caller
 * needs a new one to recover this seat again in the future; never the same
 * value as the code they just spent.
 */
export interface RecoverSeatAccepted {
  readonly roomId: string;
  readonly memberId: string;
  readonly capability: "player" | "gm" | "table";
  readonly recoveryCode: string;
}

export class RecoverySeatInputError extends Error {}

function fail(where: string, detail: string): never {
  throw new RecoverySeatInputError(`recover seat input: ${where}: ${detail}`);
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

/** Runtime-validates untrusted `recoverSeat` input. Fails closed; never defaults a missing field. */
export function parseRecoverSeatInput(value: unknown): RecoverSeatInput {
  if (!isRecord(value)) fail("root", "expected an object");
  const roomCode = expectBoundedString(value.roomCode, "roomCode", {
    min: MIN_SECRET_LENGTH,
    max: MAX_ROOM_CODE_LENGTH,
  });
  if (!ROOM_CODE_PATTERN.test(roomCode)) {
    fail("roomCode", "expected letters, digits, and hyphens only");
  }
  return {
    roomCode,
    recoveryCode: expectBoundedString(value.recoveryCode, "recoveryCode", {
      min: MIN_SECRET_LENGTH,
      max: MAX_RECOVERY_CODE_LENGTH,
    }),
  };
}
