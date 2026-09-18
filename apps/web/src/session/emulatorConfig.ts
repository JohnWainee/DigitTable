import type { SessionEmulatorConfig } from "./FirebaseSessionClient.js";

export interface EmulatorEnvironment {
  readonly VITE_FIREBASE_USE_EMULATOR?: string | undefined;
  readonly VITE_EMULATOR_HOST?: string | undefined;
}

const HOST_PATTERN = /^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:]+\])$/;

/**
 * Ports match `firebase.json`. The host defaults to the page's own hostname
 * so one build works from `localhost` on the laptop and from
 * `http://<laptop-ip>:5173` on a phone (where `127.0.0.1` would be the phone
 * itself); `VITE_EMULATOR_HOST` overrides it. Returns `undefined` unless
 * `VITE_FIREBASE_USE_EMULATOR=true`, so a real-project build can never
 * silently point at an emulator.
 */
export function emulatorConfigFor(
  environment: EmulatorEnvironment,
  pageHostname: string | undefined,
): SessionEmulatorConfig | undefined {
  if (environment.VITE_FIREBASE_USE_EMULATOR !== "true") return undefined;
  const override = environment.VITE_EMULATOR_HOST;
  if (override && !HOST_PATTERN.test(override)) {
    throw new Error(
      `VITE_EMULATOR_HOST must be a bare hostname or IP (no scheme or port), got "${override}".`,
    );
  }
  const host = override || pageHostname || "127.0.0.1";
  return {
    auth: { url: `http://${host}:9099` },
    functions: { host, port: 5001 },
    firestore: { host, port: 8080 },
  };
}
