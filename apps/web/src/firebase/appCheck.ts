import { getApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";

export interface AppCheckEnvironment {
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
}

/**
 * Wires Firebase App Check in monitoring mode: tokens are attached to
 * requests and traffic becomes visible in the Firebase console, but no
 * product has its "Enforce" toggle turned on. Enforcement is a "before
 * public preview" gate (docs/ARCHITECTURE.md section 11), not a Phase 2
 * concern, and is a console-side setting this code deliberately does not
 * (and cannot) flip. Returns `null` without a site key rather than silently
 * running unprotected — matches `firebaseConfigFrom`'s "no project fallback"
 * discipline (PR 2 review S7).
 */
export function initializeMonitoringAppCheck(environment: AppCheckEnvironment): AppCheck | null {
  const siteKey = environment.VITE_RECAPTCHA_SITE_KEY;
  if (!siteKey) return null;

  return initializeAppCheck(getApp(), {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
