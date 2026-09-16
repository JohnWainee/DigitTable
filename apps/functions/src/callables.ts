import type { Firestore } from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
  type CallableFunction,
  type CallableRequest,
} from "firebase-functions/v2/https";
import {
  AdmissionInputError,
  FUNCTIONS_REGION,
  RecoverySeatInputError,
  RoomDataError,
  SessionInputError,
  parseAdmitMemberInput,
  parseClaimSeatInput,
  parseCreateRoomInput,
  parseRecoverSeatInput,
  type AdmissionAccepted,
  type AdmitMemberInput,
  type ClaimSeatInput,
  type CreateRoomAccepted,
  type RecoverSeatAccepted,
  type StableErrorCode,
} from "@digitable/contracts";
import { admitMember as admitMemberTxn, claimSeat as claimSeatTxn } from "./admissionAuthority.js";
import { createRoom as createRoomTxn, type CreateRoomResult } from "./createRoomAuthority.js";
import { recoverSeat as recoverSeatTxn, type RecoverySeatResult } from "./recoverySeatAuthority.js";
import { clientIpFrom } from "./clientIp.js";
import { grpcCodeFor } from "./httpsErrors.js";
import {
  checkAndConsumeAdmissionThrottle,
  checkAndConsumeCreateRoomThrottle,
  checkAndConsumeRecoveryThrottle,
} from "./throttle.js";
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

export type AdmissionCallableName = "admitMember" | "claimSeat" | "createRoom" | "recoverSeat";

/** The subset of the underlying HTTP request that per-IP throttling reads. */
interface RawRequestMetadata {
  readonly ip?: string;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}

/** An admission callable: untrusted JSON in, the accepted seat out (or an `HttpsError`). */
export type AdmissionCallable = CallableFunction<unknown, Promise<AdmissionAccepted>>;

/** A `createRoom` callable: untrusted JSON in, the accepted room+GM seat out (or an `HttpsError`). */
export type CreateRoomCallable = CallableFunction<unknown, Promise<CreateRoomAccepted>>;

/** A `recoverSeat` callable: untrusted JSON in, the rebound seat + fresh recovery code out (or an `HttpsError`). */
export type RecoverSeatCallable = CallableFunction<unknown, Promise<RecoverSeatAccepted>>;

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

/**
 * Runtime-validates the untrusted payload; a malformed payload is rejected
 * before any Firestore read. `AdmitMemberInput`/`ClaimSeatInput` throw
 * `AdmissionInputError` (`@digitable/contracts/admission.js`);
 * `CreateRoomInput` throws `SessionInputError`
 * (`@digitable/contracts/session.js`) — both map to the same stable code
 * and fixed message, since neither parser's detail string (which echoes the
 * offending value's shape) is safe to send to a client or a log.
 */
function parseInput<TInput>(parse: (value: unknown) => TInput, data: unknown): TInput {
  try {
    return parse(data);
  } catch (error) {
    if (
      error instanceof AdmissionInputError ||
      error instanceof SessionInputError ||
      error instanceof RecoverySeatInputError
    ) {
      throw toHttpsError("INVALID_REQUEST", "The request was malformed.");
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

/** Same shape as `requireThrottle`, over `createRoom`'s uid/ip-only bucket set (board task A03: no room code exists yet to key on). */
async function requireCreateRoomThrottle(
  deps: AdmissionCallableDependencies,
  request: CallableRequest<unknown>,
  uid: string,
): Promise<void> {
  const raw = request.rawRequest as unknown as RawRequestMetadata;
  const ip = clientIpFrom({ ip: raw.ip, forwardedFor: raw.headers["x-forwarded-for"] });
  let allowed: boolean;
  try {
    ({ allowed } = await checkAndConsumeCreateRoomThrottle(deps.db, { ip, uid }, deps.now()));
  } catch (error) {
    if (error instanceof RoomDataError) {
      throw toHttpsError("ROOM_DATA_INVALID", "This room's data could not be verified.");
    }
    throw error;
  }
  if (!allowed) {
    throw toHttpsError("RATE_LIMITED", "Too many rooms created. Try again in a minute.");
  }
}

/** Same shape as `requireThrottle`, over `recoverSeat`'s room-code+IP / IP-only bucket set (board task A06). */
async function requireRecoveryThrottle(
  deps: AdmissionCallableDependencies,
  request: CallableRequest<unknown>,
  roomCode: string,
): Promise<void> {
  const raw = request.rawRequest as unknown as RawRequestMetadata;
  const ip = clientIpFrom({ ip: raw.ip, forwardedFor: raw.headers["x-forwarded-for"] });
  let allowed: boolean;
  try {
    ({ allowed } = await checkAndConsumeRecoveryThrottle(deps.db, { roomCode, ip }, deps.now()));
  } catch (error) {
    if (error instanceof RoomDataError) {
      throw toHttpsError("ROOM_DATA_INVALID", "This room's data could not be verified.");
    }
    throw error;
  }
  if (!allowed) {
    throw toHttpsError("RATE_LIMITED", "Too many recovery attempts. Try again in a minute.");
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
 * `createRoom`'s own pipeline: App Check monitoring → auth → payload
 * validation → throttle (per UID, per IP — no room code exists yet to key
 * on) → one Firestore transaction. Kept distinct from `handleAdmission`
 * rather than generalized over it: `CreateRoomInput` has no `roomCode`
 * field (`handleAdmission`'s generic bound requires one), and the result
 * type (`CreateRoomAccepted`, with `tableCode`) differs from
 * `AdmissionAccepted`.
 */
async function handleCreateRoom(
  deps: AdmissionCallableDependencies,
  request: CallableRequest<unknown>,
): Promise<CreateRoomAccepted> {
  logAppCheckStatus(deps, request, "createRoom");
  const uid = requireAuth(request);
  const input = parseInput(parseCreateRoomInput, request.data);
  await requireCreateRoomThrottle(deps, request, uid);

  const result: CreateRoomResult = await createRoomTxn(deps.db, uid, input);
  if (!result.ok) {
    deps.logger.info("admission.denied", { function: "createRoom", code: result.code });
    throw toHttpsError(result.code, result.message);
  }
  return result.accepted;
}

/**
 * `recoverSeat`'s own pipeline: App Check monitoring → auth → payload
 * validation → throttle (per room-code+IP, per IP) → one Firestore
 * transaction. Kept distinct from `handleAdmission` for the same reason
 * `handleCreateRoom` is: `RecoverSeatInput` has no client-asserted capability
 * request (the server determines the seat from the code alone), and the
 * result type differs.
 */
async function handleRecoverSeat(
  deps: AdmissionCallableDependencies,
  request: CallableRequest<unknown>,
): Promise<RecoverSeatAccepted> {
  logAppCheckStatus(deps, request, "recoverSeat");
  const uid = requireAuth(request);
  const input = parseInput(parseRecoverSeatInput, request.data);
  await requireRecoveryThrottle(deps, request, input.roomCode);

  const result: RecoverySeatResult = await recoverSeatTxn(deps.db, uid, input);
  if (!result.ok) {
    deps.logger.info("admission.denied", { function: "recoverSeat", code: result.code });
    throw toHttpsError(result.code, result.message);
  }
  return result.accepted;
}

/**
 * Builds the four admission/room-creation/recovery callables against
 * explicit dependencies. The production instances in `src/index.ts` use
 * the Admin SDK's default Firestore, the Functions logger, and the wall
 * clock; emulator tests build their own with a recording logger and a
 * controllable clock, then invoke `.run()` — the same handler a deployed
 * HTTPS request reaches.
 */
export function createAdmissionCallables(deps: AdmissionCallableDependencies): {
  readonly admitMember: AdmissionCallable;
  readonly claimSeat: AdmissionCallable;
  readonly createRoom: CreateRoomCallable;
  readonly recoverSeat: RecoverSeatCallable;
} {
  return {
    admitMember: onCall<unknown, Promise<AdmissionAccepted>>(
      { enforceAppCheck: false, region: FUNCTIONS_REGION },
      (request) =>
        handleAdmission<AdmitMemberInput>(
          deps,
          "admitMember",
          request,
          parseAdmitMemberInput,
          admitMemberTxn,
        ),
    ),
    claimSeat: onCall<unknown, Promise<AdmissionAccepted>>(
      { enforceAppCheck: false, region: FUNCTIONS_REGION },
      (request) =>
        handleAdmission<ClaimSeatInput>(
          deps,
          "claimSeat",
          request,
          parseClaimSeatInput,
          claimSeatTxn,
        ),
    ),
    createRoom: onCall<unknown, Promise<CreateRoomAccepted>>(
      { enforceAppCheck: false, region: FUNCTIONS_REGION },
      (request) => handleCreateRoom(deps, request),
    ),
    recoverSeat: onCall<unknown, Promise<RecoverSeatAccepted>>(
      { enforceAppCheck: false, region: FUNCTIONS_REGION },
      (request) => handleRecoverSeat(deps, request),
    ),
  };
}
