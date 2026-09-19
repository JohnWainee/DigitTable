import type { FirebaseApp } from "firebase/app";
import {
  type AdmissionAccepted,
  type Capability,
  type ClaimGmSeatInput,
  type ClaimGmSeatResult,
  type CreateRoomAccepted,
  type CreateRoomInput,
  type CreateRoomResult,
  type JoinRoomInput,
  type JoinRoomResult,
  type RecoverSeatAccepted,
  type RecoverSeatInput,
  type RoomAdmissionAccepted,
  type RoomAdmissionRejected,
} from "@digitable/contracts";
import { callable, getRoomFunctions, type FunctionsEmulatorConfig } from "../firebase/functions.js";
import type { FirestoreEmulatorConfig } from "../firebase/firestore.js";
import { stableErrorFromThrown } from "../firebase/functionsError.js";
import {
  signInForAdmission,
  waitForCurrentUser,
  type AuthEmulatorConfig,
} from "../firebase/anonymousAuth.js";

export interface SessionEmulatorConfig {
  readonly auth: AuthEmulatorConfig;
  readonly functions: FunctionsEmulatorConfig;
  readonly firestore: FirestoreEmulatorConfig;
}

export type RecoverSeatResult =
  ({ readonly ok: true } & RecoverSeatAccepted) | RoomAdmissionRejected;

/** The server's admission-family callables (`apps/functions`) don't take a `requestId` — only `createRoom` does (board task A03). */
interface AdmitMemberWireInput {
  readonly roomCode: string;
  readonly passphrase: string;
  readonly requestedCapability: Exclude<Capability, "gm">;
  readonly displayName: string;
}
interface ClaimSeatWireInput {
  readonly roomCode: string;
  readonly passphrase: string;
  readonly displayName: string;
}

/**
 * Board task A05: the real create/join/claim transport, wrapping the
 * `createRoom`/`admitMember`/`claimSeat` callables (`apps/functions`,
 * board tasks A01/A03) behind board task A02's client contracts
 * (`@digitable/contracts/session.js`). Every method ensures an anonymous
 * identity exists first (`signInForAdmission`) — the platform's stable
 * room identity is the server-minted member seat, never this UID
 * (docs/ARCHITECTURE.md section 8). Bound to one `FirebaseApp` instance for
 * its whole lifetime (not re-derived per call from environment config) so
 * auth, Functions, and Firestore all agree on which app they're talking to
 * — a real risk once more than one `FirebaseApp` exists in a process, which
 * is exactly this module's own emulator integration tests' situation (two
 * independent anonymous identities in one test run).
 */
export class FirebaseSessionClient {
  private readonly app: FirebaseApp;
  private readonly emulator: SessionEmulatorConfig | undefined;

  constructor(app: FirebaseApp, emulator?: SessionEmulatorConfig) {
    this.app = app;
    this.emulator = emulator;
  }

  /**
   * Resolves the current identity, restoring a persisted session before
   * minting a fresh one (board task A05: a reload must not strand an
   * existing seat's `uidBindings` entry under an abandoned identity).
   */
  async ensureSignedIn(): Promise<string> {
    const restored = await waitForCurrentUser(this.app, this.emulator?.auth);
    if (restored !== null) return restored.uid;
    const user = await signInForAdmission(this.app, this.emulator?.auth);
    return user.uid;
  }

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    await this.ensureSignedIn();
    const fn = callable<CreateRoomInput, CreateRoomAccepted>(
      getRoomFunctions(this.app, this.emulator?.functions),
      "createRoom",
    );
    try {
      const response = await fn(input);
      return response.data;
    } catch (error) {
      return { ok: false, ...stableErrorFromThrown(error) };
    }
  }

  async joinRoom(input: JoinRoomInput): Promise<JoinRoomResult> {
    await this.ensureSignedIn();
    const fn = callable<AdmitMemberWireInput, AdmissionAccepted>(
      getRoomFunctions(this.app, this.emulator?.functions),
      "admitMember",
    );
    try {
      const response = await fn({
        roomCode: input.roomCode,
        passphrase: input.passphrase,
        requestedCapability: input.requestedCapability,
        displayName: input.displayName,
      });
      return toRoomAdmissionAccepted(input.roomCode, response.data);
    } catch (error) {
      return { ok: false, ...stableErrorFromThrown(error) };
    }
  }

  async claimGmSeat(input: ClaimGmSeatInput): Promise<ClaimGmSeatResult> {
    await this.ensureSignedIn();
    const fn = callable<ClaimSeatWireInput, AdmissionAccepted>(
      getRoomFunctions(this.app, this.emulator?.functions),
      "claimSeat",
    );
    try {
      const response = await fn({
        roomCode: input.roomCode,
        passphrase: input.passphrase,
        displayName: input.displayName,
      });
      return toRoomAdmissionAccepted(input.roomCode, response.data);
    } catch (error) {
      return { ok: false, ...stableErrorFromThrown(error) };
    }
  }

  async recoverSeat(input: RecoverSeatInput): Promise<RecoverSeatResult> {
    await this.ensureSignedIn();
    const fn = callable<RecoverSeatInput, RecoverSeatAccepted>(
      getRoomFunctions(this.app, this.emulator?.functions),
      "recoverSeat",
    );
    try {
      const response = await fn(input);
      return { ok: true, ...response.data };
    } catch (error) {
      return { ok: false, ...stableErrorFromThrown(error) };
    }
  }
}

/**
 * `admitMember`/`claimSeat` return `roomId` and `roomRevision` directly (a
 * same-session A05 fix to `AdmissionAccepted` — see
 * `packages/contracts/src/admission.ts` and
 * `apps/functions/src/admissionAuthority.ts`). An earlier version of this
 * function approximated `roomRevision` by reading the joining member's own
 * projection and defaulting to `0` when it didn't exist yet — wrong for any
 * member who joins after an earlier command has already run in that room
 * (independent A05 review finding). The server-echoed value is exact, not
 * an approximation, and needs no extra Firestore round trip.
 */
function toRoomAdmissionAccepted(
  roomCode: string,
  accepted: AdmissionAccepted,
): RoomAdmissionAccepted {
  return {
    ok: true,
    roomId: accepted.roomId,
    roomCode,
    memberId: accepted.memberId,
    capability: accepted.capability,
    recoveryCode: accepted.recoveryCode,
    roomRevision: accepted.roomRevision,
  };
}
