import type { FirebaseApp } from "firebase/app";
import { FunctionsError } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
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
  type RoomAdmissionAccepted,
  type StableErrorCode,
} from "@digitable/contracts";
import { callable, getRoomFunctions, type FunctionsEmulatorConfig } from "../firebase/functions.js";
import { getRoomFirestore, type FirestoreEmulatorConfig } from "../firebase/firestore.js";
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

function viewerIdFor(capability: Capability, memberId: string): string {
  return capability === "player" ? memberId : capability;
}

/**
 * The server always throws `HttpsError(grpcCode, message, { code: stableCode })`
 * (`apps/functions/src/httpsErrors.ts`), so `details` is `{ code:
 * StableErrorCode }` on every deliberate rejection this client can receive.
 * An error the server never intended as a modeled rejection (a bug, an
 * unmapped exception) has no such `details` and falls back to a generic
 * code rather than fabricating a false-precise one.
 */
function stableErrorFromThrown(error: unknown): { code: StableErrorCode; message: string } {
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
      return this.toRoomAdmissionAccepted(input.roomCode, response.data);
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
      return this.toRoomAdmissionAccepted(input.roomCode, response.data);
    } catch (error) {
      return { ok: false, ...stableErrorFromThrown(error) };
    }
  }

  /**
   * `admitMember`/`claimSeat` return `roomId` directly (a same-session A05
   * fix to `AdmissionAccepted` — see `packages/contracts/src/admission.ts`
   * and `apps/functions/src/admissionAuthority.ts`; previously the response
   * carried no `roomId` at all, which would have left a client that joined
   * by code with no way to address any of that room's Firestore documents,
   * since `roomCodes/{code}` is service-only). `roomRevision` still isn't
   * returned by those callables, so this reads the joining member's own
   * freshly-available projection for the authoritative value — the same
   * read the UI needs next anyway. When no projection exists yet (no game
   * command has run in this room since it was created — board task A04
   * only writes one per live viewer on each accepted command, not on join),
   * `roomRevision: 0` is not a guess: it is the only value a room with zero
   * accepted commands can have.
   */
  private async toRoomAdmissionAccepted(
    roomCode: string,
    accepted: AdmissionAccepted,
  ): Promise<RoomAdmissionAccepted> {
    const viewerId = viewerIdFor(accepted.capability, accepted.memberId);
    const db = getRoomFirestore(this.app, this.emulator?.firestore);
    const projectionSnap = await getDoc(
      doc(db, `rooms/${accepted.roomId}/projections/${viewerId}`),
    );
    const roomRevision =
      projectionSnap.exists() && typeof projectionSnap.data().roomRevision === "number"
        ? (projectionSnap.data().roomRevision as number)
        : 0;
    return {
      ok: true,
      roomId: accepted.roomId,
      roomCode,
      memberId: accepted.memberId,
      capability: accepted.capability,
      recoveryCode: accepted.recoveryCode,
      roomRevision,
    };
  }
}
