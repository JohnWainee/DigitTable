import type { FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";

export interface AppCheckEnvironment {
  /** A reCAPTCHA *Enterprise* site key (docs/ARCHITECTURE.md section 11), not a classic v3 key. */
  readonly VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?: string;
}

/**
 * Wires Firebase App Check in monitoring mode with the canonical web
 * reCAPTCHA Enterprise provider (docs/ARCHITECTURE.md section 11): tokens
 * are attached to outgoing requests and traffic becomes visible in the
 * Firebase console, but no product has its "Enforce" toggle turned on.
 * Enforcement is a "before public preview" gate — a console-side setting
 * this code deliberately does not (and cannot) flip; the callables in
 * `apps/functions` likewise run with `enforceAppCheck: false`. Returns
 * `null` without a site key rather than silently guessing one — matches
 * `firebaseConfigFrom`'s "no project fallback" discipline (PR 2 review S7).
 */
export function initializeMonitoringAppCheck(
  app: FirebaseApp,
  environment: AppCheckEnvironment,
): AppCheck | null {
  const siteKey = environment.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  if (!siteKey) return null;

  return initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
