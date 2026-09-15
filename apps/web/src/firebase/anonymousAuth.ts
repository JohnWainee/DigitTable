import type { FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";

export interface AuthEmulatorConfig {
  readonly url: string;
}

const emulatorConnected = new WeakSet<Auth>();

/**
 * Takes an explicit `app` (board task A05 fix) rather than deriving one
 * from environment config internally: the earlier shape called
 * `ensureFirebaseApp(environment)`, which resolves to whatever the
 * *default* Firebase app happens to be (`getApps().length > 0 ? getApp() :
 * initializeApp(...)`) — silently different from a caller's own named
 * `FirebaseApp` instance (e.g. `FirebaseSessionClient`'s `app`) whenever
 * more than one app exists in the process, which is exactly the situation
 * this module's own emulator integration tests need (two independent
 * anonymous identities in one test run). Production code still only ever
 * has one app; passing it explicitly costs nothing there and fixes the
 * multi-app case for tests.
 */
function authFor(app: FirebaseApp, emulator?: AuthEmulatorConfig): Auth {
  const auth = getAuth(app);
  if (emulator !== undefined && !emulatorConnected.has(auth)) {
    // `disableWarnings`: the emulator banner is developer-facing noise in a
    // headless test run; it changes no security behavior.
    connectAuthEmulator(auth, emulator.url, { disableWarnings: true });
    emulatorConnected.add(auth);
  }
  return auth;
}

/**
 * Acquires the replaceable anonymous identity used only to call the
 * admission/room-command authority. Stable room identity is created
 * server-side as a member seat; this UID is never accepted as a member ID
 * (Phase 2 PR 3). Reuses the current user if one is already signed in
 * (board task A05: a page reload must not mint a fresh, unrelated UID —
 * that would strand every existing `uidBindings/{uid}` the old identity
 * held; see `waitForCurrentUser`, which callers should prefer on startup).
 */
export async function signInForAdmission(
  app: FirebaseApp,
  emulator?: AuthEmulatorConfig,
): Promise<User> {
  const auth = authFor(app, emulator);
  if (auth.currentUser !== null) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}

/**
 * Resolves once Firebase Auth has restored (or failed to restore) a
 * persisted session, before any callable is invoked — `auth.currentUser` is
 * `null` synchronously on a fresh page load even when a session will shortly
 * restore from local persistence, so a caller that checked it immediately
 * would wrongly conclude no identity exists and mint a redundant new one.
 */
export function waitForCurrentUser(
  app: FirebaseApp,
  emulator?: AuthEmulatorConfig,
): Promise<User | null> {
  const auth = authFor(app, emulator);
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
        unsubscribe();
        reject(error);
      },
    );
  });
}
