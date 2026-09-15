import type { FirebaseApp } from "firebase/app";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
  type HttpsCallable,
} from "firebase/functions";

/**
 * Board task A05: the real callable transport. `getFunctions` returns the
 * same instance for a given `(app, region)` pair, so calling this more than
 * once for the same app is cheap and safe — it does not reconnect the
 * emulator a second time (guarded by `emulatorConnected`, since
 * `connectFunctionsEmulator` throws if called twice on the same instance).
 */
const emulatorConnected = new WeakSet<Functions>();

export interface FunctionsEmulatorConfig {
  readonly host: string;
  readonly port: number;
}

/**
 * Resolves the Functions instance for `app`, optionally pointed at the
 * local emulator. No region is passed — the deployed Functions default to
 * `us-central1` unless the callable's own options specify otherwise
 * (matching `apps/functions`, which also names no region in code; see
 * `docs/PHASE_2_DECISION_BRIEF.md` for the outstanding region decision).
 */
export function getRoomFunctions(app: FirebaseApp, emulator?: FunctionsEmulatorConfig): Functions {
  const functions = getFunctions(app);
  if (emulator !== undefined && !emulatorConnected.has(functions)) {
    connectFunctionsEmulator(functions, emulator.host, emulator.port);
    emulatorConnected.add(functions);
  }
  return functions;
}

/** Typed `httpsCallable` wrapper — untrusted JSON in, untrusted JSON out; callers parse/validate the response themselves. */
export function callable<TRequest, TResponse>(
  functions: Functions,
  name: string,
): HttpsCallable<TRequest, TResponse> {
  return httpsCallable<TRequest, TResponse>(functions, name);
}
