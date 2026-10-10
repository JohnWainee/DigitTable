import type { SessionEmulatorConfig } from "./FirebaseSessionClient.js";

export interface EmulatorEnvironment {
  readonly VITE_FIREBASE_USE_EMULATOR?: string | undefined;
  readonly VITE_EMULATOR_HOST?: string | undefined;
  readonly VITE_EMULATOR_AUTH_PORT?: string | undefined;
  readonly VITE_EMULATOR_FUNCTIONS_PORT?: string | undefined;
  readonly VITE_EMULATOR_FIRESTORE_PORT?: string | undefined;
}

const HOST_PATTERN = /^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:]+\])$/;

function configuredPort(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer port from 1 to 65535.`);
  }
  return port;
}

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
  const authPort = configuredPort(
    environment.VITE_EMULATOR_AUTH_PORT,
    9099,
    "VITE_EMULATOR_AUTH_PORT",
  );
  const functionsPort = configuredPort(
    environment.VITE_EMULATOR_FUNCTIONS_PORT,
    5001,
    "VITE_EMULATOR_FUNCTIONS_PORT",
  );
  const firestorePort = configuredPort(
    environment.VITE_EMULATOR_FIRESTORE_PORT,
    8080,
    "VITE_EMULATOR_FIRESTORE_PORT",
  );
  return {
    auth: { url: `http://${host}:${authPort}` },
    functions: { host, port: functionsPort },
    firestore: { host, port: firestorePort },
  };
}
