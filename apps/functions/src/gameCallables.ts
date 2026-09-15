import {
  HttpsError,
  onCall,
  type CallableFunction,
  type CallableRequest,
} from "firebase-functions/v2/https";
import type { Firestore } from "firebase-admin/firestore";
import type { EatTheReichEvent } from "@digitable/template-eat-the-reich";
import type { RoomCommandResult, StableErrorCode } from "@digitable/contracts";
import { grpcCodeFor } from "./httpsErrors.js";
import {
  GameCommandInputError,
  parseWireCommandRequest,
  productionGameCommandClock,
  submitRoomCommand,
  type GameCommandDependencies,
  type GameCommandLogger,
} from "./gameCommandAuthority.js";

export interface SubmitRoomCommandDependencies {
  readonly db: Firestore;
  readonly logger: GameCommandLogger;
  readonly occurredAtServer?: () => string;
  readonly randomBytes?: (size: number) => Uint8Array;
}

export type SubmitRoomCommandCallable = CallableFunction<
  unknown,
  Promise<RoomCommandResult<EatTheReichEvent>>
>;

function toHttpsError(code: StableErrorCode, message: string): HttpsError {
  return new HttpsError(grpcCodeFor(code), message, { code });
}

function requireAuth(request: CallableRequest<unknown>): string {
  if (request.auth === undefined) {
    throw toHttpsError("AUTH_REQUIRED", "Sign in is required to act in this room.");
  }
  return request.auth.uid;
}

function requireRoomId(request: CallableRequest<unknown>): string {
  const data = request.data as { readonly roomId?: unknown } | null;
  const roomId = data === null || typeof data !== "object" ? undefined : data.roomId;
  if (typeof roomId !== "string" || roomId.length === 0) {
    throw toHttpsError("INVALID_REQUEST", "A room ID is required.");
  }
  return roomId;
}

/**
 * `App Check monitoring -> auth -> parse -> resolveCapability/decide/write`
 * (board task A04), matching `callables.ts`'s admission pipeline shape.
 * App Check runs in monitoring mode only, same as PR #13's admission
 * callables (`docs/ARCHITECTURE.md` section 11's "before public preview"
 * enforcement gate) — no separate rate limit is applied to game commands
 * beyond platform authorization's payload-size check and the per-actor
 * receipt/revision discipline `gameCommandAuthority.ts` already enforces;
 * an authenticated, bound member issuing commands against their own room is
 * not the same threat model as an unauthenticated join attempt.
 */
async function handleSubmitRoomCommand(
  deps: SubmitRoomCommandDependencies,
  request: CallableRequest<unknown>,
): Promise<RoomCommandResult<EatTheReichEvent>> {
  if (request.app === undefined) {
    deps.logger.info("gameCommand.appCheckMissing", { function: "submitRoomCommand" });
  }
  const uid = requireAuth(request);
  const roomId = requireRoomId(request);

  const data = request.data as { readonly command?: unknown };
  let wire;
  try {
    wire = parseWireCommandRequest(data.command);
  } catch (error) {
    if (error instanceof GameCommandInputError) {
      throw toHttpsError("INVALID_REQUEST", "The command request was malformed.");
    }
    throw error;
  }

  const gameDeps: GameCommandDependencies = {
    db: deps.db,
    logger: deps.logger,
    occurredAtServer: deps.occurredAtServer ?? productionGameCommandClock.occurredAtServer,
    randomBytes: deps.randomBytes ?? productionGameCommandClock.randomBytes,
  };

  return submitRoomCommand(roomId, uid, wire, gameDeps);
}

/**
 * Builds the `submitRoomCommand` callable against explicit dependencies —
 * same production/test-injection shape as `callables.ts`'s
 * `createAdmissionCallables`.
 */
export function createGameCallables(deps: SubmitRoomCommandDependencies): {
  readonly submitRoomCommand: SubmitRoomCommandCallable;
} {
  return {
    submitRoomCommand: onCall<unknown, Promise<RoomCommandResult<EatTheReichEvent>>>(
      { enforceAppCheck: false },
      (request) => handleSubmitRoomCommand(deps, request),
    ),
  };
}
