import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { firebaseConfigFrom, type FirebaseEnvironment } from "./config.js";

/**
 * Returns the single Firebase app for this page, initializing it from the
 * explicit environment configuration on first use. Throws (via
 * `firebaseConfigFrom`) when the configuration is incomplete rather than
 * guessing a project.
 */
export function ensureFirebaseApp(environment: FirebaseEnvironment): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfigFrom(environment));
}
