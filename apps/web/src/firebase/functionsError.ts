import { FunctionsError } from "firebase/functions";
import type { StableErrorCode } from "@digitable/contracts";

/**
 * The server always throws `HttpsError(grpcCode, message, { code: stableCode })`
 * (`apps/functions/src/httpsErrors.ts`), so `details` is `{ code:
 * StableErrorCode }` on every deliberate rejection this client can receive.
 * An error the server never intended as a modeled rejection (a bug, an
 * unmapped exception) has no such `details` and falls back to a generic
 * code rather than fabricating a false-precise one.
 *
 * Shared between `FirebaseSessionClient` and `FirebaseRoomRepository`
 * (independent A05 review, Low finding: the two previously carried
 * byte-identical copies of this function).
 */
export function stableErrorFromThrown(error: unknown): { code: StableErrorCode; message: string } {
  if (error instanceof FunctionsError) {
    const details = error.details;
    if (
      typeof details === "object" &&
      details !== null &&
      typeof (details as { readonly code?: unknown }).code === "string"
    ) {
      return {
        code: (details as { readonly code: string }).code as StableErrorCode,
        message: error.message,
      };
    }
  }
  return { code: "UNKNOWN_ACTION", message: "The request could not be completed." };
}
