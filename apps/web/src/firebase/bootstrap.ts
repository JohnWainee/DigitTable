import type { FirebaseApp } from "firebase/app";
import type { AppCheck } from "firebase/app-check";
import { ensureFirebaseApp } from "./app.js";
import { initializeMonitoringAppCheck, type AppCheckEnvironment } from "./appCheck.js";
import { hasFirebaseConfig, type FirebaseEnvironment } from "./config.js";

export type FirebaseBootstrapEnvironment = FirebaseEnvironment & AppCheckEnvironment;

export interface FirebaseBootstrap {
  readonly app: FirebaseApp;
  /** `null` when no reCAPTCHA Enterprise site key is configured (monitoring stays off, never guessed). */
  readonly appCheck: AppCheck | null;
}

/**
 * The application-startup seam for Firebase (called once from `main.tsx`,
 * before render). App Check must be initialized before any Firebase service
 * is first used, so monitoring is wired here rather than lazily at the
 * point of the first admission call. Returns `null` — touching no Firebase
 * service at all — when the Firebase configuration is absent, which is the
 * local-only build that still runs Phase 1C's in-memory simulation.
 */
export function bootstrapFirebase(
  environment: FirebaseBootstrapEnvironment,
): FirebaseBootstrap | null {
  if (!hasFirebaseConfig(environment)) return null;
  const app = ensureFirebaseApp(environment);
  return { app, appCheck: initializeMonitoringAppCheck(app, environment) };
}
