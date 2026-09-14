import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";

export type { RulesTestEnvironment } from "@firebase/rules-unit-testing";

/**
 * A thin `@firebase/rules-unit-testing` wrapper (Phase 2 PR 1,
 * docs/PHASE_2_PLAN.md: "packages/testing emulator helpers"). Connects to
 * the Firestore/RTDB emulators started by `firebase emulators:exec` (see the
 * root `firebase.json`/`.firebaserc` and the `test:emulator` npm script) —
 * it never creates, discovers, or authenticates against a real Firebase
 * project. `DEMO_PROJECT_ID` uses the Emulator Suite's documented `demo-`
 * prefix, which the emulators treat as an offline fake project regardless of
 * whether a project by that name is ever created
 * (https://firebase.google.com/docs/emulator-suite/connect_firestore#choose_a_firebase_project).
 */
export const DEMO_PROJECT_ID = "demo-digitable";

const FIRESTORE_EMULATOR_HOST = "127.0.0.1";
const FIRESTORE_EMULATOR_PORT = 8080;
const DATABASE_EMULATOR_HOST = "127.0.0.1";
const DATABASE_EMULATOR_PORT = 9000;
const AUTH_EMULATOR_HOST = "127.0.0.1";
const AUTH_EMULATOR_PORT = 9099;

// packages/testing/src/emulator.ts -> repo root (where firebase.json/firestore.rules/
// database.rules.json live) is three directories up.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Opens a rules-unit-testing environment against the already-running
 * Firestore and RTDB emulators, loading the room data model's rule sets at
 * the repo root (`firestore.rules`/`database.rules.json`, Phase 2 PR 2).
 * Callers must call `testEnv.cleanup()` when done.
 */
export function createEmulatorTestEnvironment(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: DEMO_PROJECT_ID,
    firestore: {
      rules: readFileSync(join(REPO_ROOT, "firestore.rules"), "utf8"),
      host: FIRESTORE_EMULATOR_HOST,
      port: FIRESTORE_EMULATOR_PORT,
    },
    database: {
      rules: readFileSync(join(REPO_ROOT, "database.rules.json"), "utf8"),
      host: DATABASE_EMULATOR_HOST,
      port: DATABASE_EMULATOR_PORT,
    },
  });
}

/**
 * Confirms the Auth emulator is up by hitting its documented config
 * endpoint. `@firebase/rules-unit-testing` has no Auth-specific test
 * environment (Auth emulator testing arrives with Phase 2 PR 3's admission
 * flow); this PR only needs to prove the emulator boots and is reachable.
 */
export async function isAuthEmulatorReachable(): Promise<boolean> {
  const response = await fetch(
    `http://${AUTH_EMULATOR_HOST}:${AUTH_EMULATOR_PORT}/emulator/v1/projects/${DEMO_PROJECT_ID}/config`,
  );
  return response.ok;
}
