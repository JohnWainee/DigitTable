import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously, type User } from "firebase/auth";
import { firebaseConfigFrom, type FirebaseEnvironment } from "./config.js";

function firebaseApp(environment: FirebaseEnvironment): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfigFrom(environment));
}

/**
 * Acquires the replaceable anonymous identity used only to call the admission
 * authority. Stable room identity is created server-side as a member seat;
 * this UID is never accepted as a member ID (Phase 2 PR 3).
 */
export async function signInForAdmission(environment: FirebaseEnvironment): Promise<User> {
  const credential = await signInAnonymously(getAuth(firebaseApp(environment)));
  return credential.user;
}
