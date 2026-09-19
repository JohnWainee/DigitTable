import {
  asRoomId,
  type Capability,
  type CreateRoomInput,
  type CreateRoomResult,
  type JoinRoomInput,
  type JoinRoomResult,
  type RecoverSeatInput,
  type RoomId,
  type RoomRepository,
} from "@digitable/contracts";
import type {
  EatTheReichCommand,
  EatTheReichEvent,
  EatTheReichView,
} from "@digitable/template-eat-the-reich";
import { firebaseBootstrap } from "./firebaseBootstrap.js";
import {
  FirebaseSessionClient,
  type RecoverSeatResult,
  type SessionEmulatorConfig,
} from "./FirebaseSessionClient.js";
import { emulatorConfigFor } from "./emulatorConfig.js";
import { FirebaseRoomRepository } from "../repository/FirebaseRoomRepository.js";
import { roomEngineStore } from "./RoomEngineStore.js";

/**
 * C06 (issue #14): the one seam every screen's create/join/claim/dispatch
 * call goes through. `apps/web/src/firebase/bootstrap.ts` already decides
 * fixture vs. live at startup (`hasFirebaseConfig` — no `VITE_FIREBASE_*`
 * env vars means fixture mode); this module is what actually *branches* on
 * that decision, so every screen calls the same three functions
 * (`createRoom`/`joinRoom`/`getRoomRepository`) regardless of mode.
 *
 * `VITE_FIREBASE_USE_EMULATOR=true` (see `docs/PLAYTEST_TWO_DEVICE.md`)
 * points live mode at the local Firebase emulator suite (ports match
 * `firebase.json`; host per `emulatorConfig.ts`) instead of a real project —
 * this is how "live mode against the emulator" and "fixture mode" both stay
 * reachable from one build without a real deployed backend.
 */
export const isLiveMode: boolean = firebaseBootstrap !== null;

const emulatorConfig: SessionEmulatorConfig | undefined = emulatorConfigFor(
  {
    VITE_FIREBASE_USE_EMULATOR: import.meta.env.VITE_FIREBASE_USE_EMULATOR as string | undefined,
    VITE_EMULATOR_HOST: import.meta.env.VITE_EMULATOR_HOST as string | undefined,
  },
  typeof window === "undefined" ? undefined : window.location.hostname,
);

let liveSessionClient: FirebaseSessionClient | null = null;
function getLiveSessionClient(): FirebaseSessionClient {
  if (!firebaseBootstrap) {
    throw new Error("roomClient: live mode requested but Firebase was never bootstrapped.");
  }
  liveSessionClient ??= new FirebaseSessionClient(firebaseBootstrap.app, emulatorConfig);
  return liveSessionClient;
}

export async function createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
  if (isLiveMode) return getLiveSessionClient().createRoom(input);
  return roomEngineStore.createRoom(input);
}

export async function joinRoom(input: JoinRoomInput): Promise<JoinRoomResult> {
  if (isLiveMode) return getLiveSessionClient().joinRoom(input);
  return roomEngineStore.joinRoom(input);
}

export async function recoverSeat(input: RecoverSeatInput): Promise<RecoverSeatResult> {
  if (isLiveMode) return getLiveSessionClient().recoverSeat(input);
  return roomEngineStore.recoverSeat(input);
}

/**
 * The `RoomRepository` for one already-admitted member's game commands and
 * projections — `FirebaseRoomRepository` (live) or the fixture room's own
 * `InMemoryRoomRepository` (fixture), both implementing the same
 * `@digitable/contracts` interface so no caller needs to know which.
 * Returns `null` in fixture mode for a `roomId` this tab never created or
 * joined (fixture rooms are this tab's memory only, per
 * `RoomEngineStore.ts`'s doc comment) — live mode always returns an
 * instance (the server, not this client, is authoritative on whether the
 * room exists).
 */
export function getRoomRepository(
  roomId: string,
  capability: Capability,
): RoomRepository<EatTheReichCommand, EatTheReichEvent, EatTheReichView> | null {
  const typedRoomId: RoomId = asRoomId(roomId);
  if (isLiveMode) {
    if (!firebaseBootstrap) {
      throw new Error("roomClient: live mode requested but Firebase was never bootstrapped.");
    }
    return new FirebaseRoomRepository(
      firebaseBootstrap.app,
      typedRoomId,
      capability,
      emulatorConfig,
    );
  }
  return roomEngineStore.getRepository(typedRoomId);
}

export function fixtureRoomExists(roomId: string): boolean {
  return !isLiveMode && roomEngineStore.roomExists(asRoomId(roomId));
}

/**
 * Board task A08 live verification finding: on a full page load landing
 * directly on a room route (a reload, a bookmark, `useRoomProjection`'s own
 * effect firing on mount), nothing previously ensured Firebase Auth had
 * finished restoring its persisted anonymous session before the first
 * Firestore read fired — only `FirebaseSessionClient.ensureSignedIn()`
 * (used by `createRoom`/`joinRoom`/`claimSeat`) had this discipline. A
 * projection read fired in that window can reach Firestore before the
 * SDK's auth context has propagated to it, denying with
 * `permission-denied` — reproduced live: a REST call with the exact same
 * UID and the exact same document succeeded immediately, confirming the
 * rules and the data were both already correct and this was purely a
 * client-side readiness race. No-ops in fixture mode.
 */
export async function ensureLiveAuthReady(): Promise<void> {
  if (!isLiveMode) return;
  await getLiveSessionClient().ensureSignedIn();
}
