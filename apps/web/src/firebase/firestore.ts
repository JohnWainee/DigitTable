import type { FirebaseApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from "firebase/firestore";

const emulatorConnected = new WeakSet<Firestore>();
const emulatorInstances = new WeakMap<FirebaseApp, Firestore>();

export interface FirestoreEmulatorConfig {
  readonly host: string;
  readonly port: number;
}

/**
 * Board task A05: the client's own Firestore instance, read-only per `firestore.rules` (Phase 2 PR 2) — the client never writes to any room document directly.
 *
 * Against the local Emulator Suite the instance uses long polling. Observed in the iOS Simulator (real Mobile
 * Safari on an iPhone 17 Pro and an iPhone SE 3rd generation, iOS 26.5, page on 127.0.0.1, emulators on the
 * same Mac): with the SDK's default transport, which already auto-detects long polling, a GM's own "Load
 * scene" reached the screen only when the 30 second fallback poll in `useRoomProjection` ran (30.1 s in every
 * run); with long polling forced it took 1.1 s. The root cause is not established, and no physical device or
 * LAN run was measured. Deployed Firebase is unaffected as far as measured (the same flow in the same Safari
 * against the staging site took 4.1 s) and keeps the SDK's default transport: this branch is taken only when
 * an emulator host was given, which only a `VITE_FIREBASE_USE_EMULATOR=true` build does.
 *
 * `initializeFirestore` settings can be given only on an app's first call, so the emulator instance is
 * created here once per app and every later call returns that same instance. A call without an emulator host
 * must therefore never precede one with it on the same app (the SDK would refuse the second); the app passes
 * one constant emulator config for the whole page, so that cannot happen today.
 */
export function getRoomFirestore(app: FirebaseApp, emulator?: FirestoreEmulatorConfig): Firestore {
  if (emulator === undefined) return getFirestore(app);
  let db = emulatorInstances.get(app);
  if (db === undefined) {
    db = initializeFirestore(app, { experimentalForceLongPolling: true });
    emulatorInstances.set(app, db);
  }
  if (!emulatorConnected.has(db)) {
    connectFirestoreEmulator(db, emulator.host, emulator.port);
    emulatorConnected.add(db);
  }
  return db;
}
