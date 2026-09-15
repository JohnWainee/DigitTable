import type { FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

const emulatorConnected = new WeakSet<Firestore>();

export interface FirestoreEmulatorConfig {
  readonly host: string;
  readonly port: number;
}

/** Board task A05: the client's own Firestore instance, read-only per `firestore.rules` (Phase 2 PR 2) — the client never writes to any room document directly. */
export function getRoomFirestore(app: FirebaseApp, emulator?: FirestoreEmulatorConfig): Firestore {
  const db = getFirestore(app);
  if (emulator !== undefined && !emulatorConnected.has(db)) {
    connectFirestoreEmulator(db, emulator.host, emulator.port);
    emulatorConnected.add(db);
  }
  return db;
}
