import { getAuth, signInAnonymously, type User } from "firebase/auth";
import { ensureFirebaseApp } from "./app.js";
import type { FirebaseEnvironment } from "./config.js";

/**
 * Acquires the replaceable anonymous identity used only to call the admission
 * authority. Stable room identity is created server-side as a member seat;
 * this UID is never accepted as a member ID (Phase 2 PR 3).
 */
export async function signInForAdmission(environment: FirebaseEnvironment): Promise<User> {
  const credential = await signInAnonymously(getAuth(ensureFirebaseApp(environment)));
  return credential.user;
}
