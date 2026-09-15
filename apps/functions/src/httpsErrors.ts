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
      return "resource-exhausted";
    case "ROOM_NOT_FOUND":
      return "not-found";
    case "ROOM_DATA_INVALID":
    case "ROOM_CREATION_FAILED":
      return "internal";
    case "REVISION_CONFLICT":
      return "aborted";
    case "ROLL_ALREADY_RESOLVED":
    case "TEMPLATE_VERSION_MISMATCH":
      return "failed-precondition";
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
