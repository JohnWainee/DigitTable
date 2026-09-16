import type { FunctionsErrorCode } from "firebase-functions/v2/https";
import type { StableErrorCode } from "@digitable/contracts";

/**
 * Maps a stable platform error code to the closest standard gRPC status for
 * `HttpsError`. The client-facing `details.code` carries the exact stable
 * code (`@digitable/contracts` `StableErrorCode`) that the rest of the
 * platform already branches on; the gRPC status is chosen only for correct
 * HTTP-status mapping, never for precise client branching. Exhaustive: a new
 * stable code fails to compile until it is mapped here.
 */
export function grpcCodeFor(code: StableErrorCode): FunctionsErrorCode {
  switch (code) {
    case "AUTH_REQUIRED":
      return "unauthenticated";
    case "ROLE_FORBIDDEN":
    case "ROOM_ARCHIVED":
    case "ADMISSION_CLOSED":
    case "GM_SEAT_TAKEN":
    case "INVALID_PASSPHRASE":
    case "INVALID_RECOVERY_CODE":
      return "permission-denied";
    case "RATE_LIMITED":
    case "ROOM_FULL":
    case "INSUFFICIENT_BLOOD": // Sonnet B (B02/B03): a per-character resource pool (Blood) is exhausted.
    case "ITEM_DEPLETED": // Sonnet B (B02/B03): an item/gear option is exhausted — same shape as above.
      return "resource-exhausted";
    case "ROOM_NOT_FOUND":
      return "not-found";
    case "ROOM_DATA_INVALID":
    case "ROOM_CREATION_FAILED":
      return "internal";
    case "REVISION_CONFLICT":
      return "aborted";
    // Sonnet B's contract proposals (B02-B04, the six cases below): each
    // rejects a command because current game/session state does not permit
    // it right now (not the actor's turn, the character is downed/retired,
    // the round or scene has unresolved rolls, or the session is paused) —
    // the same "valid request, wrong state" shape as the two cases above.
    case "ROLL_ALREADY_RESOLVED":
    case "TEMPLATE_VERSION_MISMATCH":
    case "NOT_YOUR_TURN":
    case "CHARACTER_DOWNED":
    case "CHARACTER_RETIRED":
    case "ROUND_HAS_OPEN_ROLLS":
    case "SCENE_HAS_OPEN_ROLLS":
    case "SESSION_PAUSED":
      return "failed-precondition";
    // Sonnet B (B02/B03): `claimCharacter`/reassign against a character
    // already bound to another member — a genuine conflict with an
    // existing binding, distinct from every "permission-denied"/
    // "failed-precondition" case above.
    case "CHARACTER_TAKEN":
      return "already-exists";
    case "PAYLOAD_TOO_LARGE":
    case "UNKNOWN_ACTION":
    case "INVALID_ALLOCATION":
    case "INVALID_REQUEST":
      return "invalid-argument";
    default: {
      const unmapped: never = code;
      throw new Error(`unmapped stable error code: ${String(unmapped)}`);
    }
  }
}
