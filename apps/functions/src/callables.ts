import type { Firestore } from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
  type CallableFunction,
  type CallableRequest,
} from "firebase-functions/v2/https";
import {
  AdmissionInputError,
  RoomDataError,
  parseAdmitMemberInput,
  parseClaimSeatInput,
  type AdmissionAccepted,
  type AdmitMemberInput,
  type ClaimSeatInput,
  type StableErrorCode,
} from "@digitable/contracts";
import { admitMember as admitMemberTxn, claimSeat as claimSeatTxn } from "./admissionAuthority.js";
import { clientIpFrom } from "./clientIp.js";
import { grpcCodeFor } from "./httpsErrors.js";
import { checkAndConsumeAdmissionThrottle } from "./throttle.js";
import type { AdmissionResult } from "./admissionAuthority.js";

/** Structured, content-free log sink; `firebase-functions/logger` in production, a recorder in tests. */
export interface AdmissionLogger {
  warn(event: string, fields: Readonly<Record<string, string>>): void;
  info(event: string, fields: Readonly<Record<string, string>>): void;
}

export interface AdmissionCallableDependencies {
  readonly db: Firestore;
  readonly logger: AdmissionLogger;
  /** Injected clock so throttle-window expiry is testable; `Date.now` in production. */
  readonly now: () => number;
}

export type AdmissionCallableName = "admitMember" | "claimSeat";

/** The subset of the underlying HTTP request that per-IP throttling reads. */
interface RawRequestMetadata {
  readonly ip?: string;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}

/** An admission callable: untrusted JSON in, the accepted seat out (or an `HttpsError`). */
export type AdmissionCallable = CallableFunction<unknown, Promise<AdmissionAccepted>>;

function toHttpsError(code: StableErrorCode, message: string): HttpsError {
  // `details.code` is the stable code clients branch on; the gRPC status is
  // only for HTTP-status mapping (see `grpcCodeFor`).
  return new HttpsError(grpcCodeFor(code), message, { code });
}

/**
 * App Check runs in monitoring mode only (`enforceAppCheck: false` on both
 * callables), matching `docs/ARCHITECTURE.md` section 11's "before public
 * preview" enforcement gate: a request without a valid token is never
 * blocked, but is logged so the console's monitoring view reflects it — the
 * server half of the monitoring decision, mirrored client-side by
 * `apps/web/src/firebase/bootstrap.ts`. Never logs the room code,
 * passphrase, or UID alongside this.
 */
function logAppCheckStatus(
  deps: AdmissionCallableDependencies,
  request: CallableRequest<unknown>,
  name: AdmissionCallableName,
): void {
  if (request.app === undefined) {
    deps.logger.warn("admission.appCheckMissing", { function: name });
  }
}

function requireAuth(request: CallableRequest<unknown>): string {
  if (request.auth === undefined) {
    throw toHttpsError("AUTH_REQUIRED", "Sign in is required before joining a room.");
  }
  return request.auth.uid;
}

/** Runtime-validates the untrusted payload; a malformed payload is rejected before any Firestore read. */
function parseInput<TInput>(parse: (value: unknown) => TInput, data: unknown): TInput {
  try {
    return parse(data);
  } catch (error) {
    if (error instanceof AdmissionInputError) {
      // Stable code, fixed message: the parser's detail string (which echoes
      // the offending value's shape) never reaches the client or a log.
      throw toHttpsError("INVALID_REQUEST", "The join request was malformed.");
    }
    throw error;
  }
}

async function requireThrottle(
  deps: AdmissionCallableDependencies,
  request: CallableRequest<unknown>,
  roomCode: string,
  uid: string,
): Promise<void> {
  // Typed locally: the throttle key needs only these two request fields, and
  // `@types/express` is deliberately not a dependency of this codebase.
  const raw = request.rawRequest as unknown as RawRequestMetadata;
  const ip = clientIpFrom({ ip: raw.ip, forwardedFor: raw.headers["x-forwarded-for"] });
  let allowed: boolean;
  try {
    ({ allowed } = await checkAndConsumeAdmissionThrottle(
      deps.db,
      { roomCode, ip, uid },
      deps.now(),
    ));
  } catch (error) {
    // A malformed counter fails closed as a stable denial, never as an
    // unmapped internal error (which would also skip the throttle).
    if (error instanceof RoomDataError) {
      throw toHttpsError("ROOM_DATA_INVALID", "This room's data could not be verified.");
    }
    throw error;
  }
  if (!allowed) {
    throw toHttpsError("RATE_LIMITED", "Too many join attempts. Try again in a minute.");
  }
}

/**
 * The shared callable pipeline: App Check monitoring → auth → payload
 * validation → throttle (per code+IP, per IP, per UID) → one Firestore
 * transaction. The throttle runs after auth and validation so its keys are
 * a verified UID and a bounded, validated room code, and before the
 * transaction so a throttled caller never reads `authority/current` or a
 * secret hash.
 */
async function handleAdmission<TInput extends { readonly roomCode: string }>(
  deps: AdmissionCallableDependencies,
  name: AdmissionCallableName,
  request: CallableRequest<unknown>,
  parse: (value: unknown) => TInput,
  run: (db: Firestore, uid: string, input: TInput) => Promise<AdmissionResult>,
): Promise<AdmissionAccepted> {
  logAppCheckStatus(deps, request, name);
  const uid = requireAuth(request);
  const input = parseInput(parse, request.data);
  await requireThrottle(deps, request, input.roomCode, uid);

  const result = await run(deps.db, uid, input);
  if (!result.ok) {
    deps.logger.info("admission.denied", { function: name, code: result.code });
    throw toHttpsError(result.code, result.message);
  }
  return result.accepted;
}

/**
 * Builds the two admission callables against explicit dependencies. The
 * production instances in `src/index.ts` use the Admin SDK's default
 * Firestore, the Functions logger, and the wall clock; emulator tests build
 * their own with a recording logger and a controllable clock, then invoke
 * `.run()` — the same handler a deployed HTTPS request reaches.
 */
export function createAdmissionCallables(deps: AdmissionCallableDependencies): {
  readonly admitMember: AdmissionCallable;
  readonly claimSeat: AdmissionCallable;
} {
  return {
    admitMember: onCall<unknown, Promise<AdmissionAccepted>>(
      { enforceAppCheck: false },
      (request) =>
        handleAdmission<AdmitMemberInput>(
          deps,
          "admitMember",
          request,
          parseAdmitMemberInput,
          admitMemberTxn,
        ),
    ),
    claimSeat: onCall<unknown, Promise<AdmissionAccepted>>({ enforceAppCheck: false }, (request) =>
      handleAdmission<ClaimSeatInput>(
        deps,
        "claimSeat",
        request,
        parseClaimSeatInput,
        claimSeatTxn,
      ),
    ),
  };
}
