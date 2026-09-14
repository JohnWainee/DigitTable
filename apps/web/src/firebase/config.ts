import type { FirebaseOptions } from "firebase/app";

export interface FirebaseEnvironment {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_DATABASE_URL?: string;
}

/**
 * Builds an explicit environment-provided Firebase configuration. There is no
 * project fallback: local emulator builds keep using the in-memory repository,
 * and a production build cannot accidentally point at staging (PR 2 review S7).
 */
export function firebaseConfigFrom(environment: FirebaseEnvironment): FirebaseOptions {
  const apiKey = environment.VITE_FIREBASE_API_KEY;
  const authDomain = environment.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = environment.VITE_FIREBASE_PROJECT_ID;
  const appId = environment.VITE_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error("Firebase configuration is incomplete for this environment.");
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    ...(environment.VITE_FIREBASE_DATABASE_URL
      ? { databaseURL: environment.VITE_FIREBASE_DATABASE_URL }
      : {}),
  };
}
