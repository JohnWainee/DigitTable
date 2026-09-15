import { defineConfig } from "vitest/config";

/**
 * Opt-in Firestore-emulator tests for the callable admission boundary
 * (Phase 2 PR 3). Deliberately NOT listed in the root `vitest.config.ts`'s
 * `test.projects`, for the same reason as `packages/testing`'s emulator
 * project: these need the Firestore emulator (and therefore a JVM) running.
 * `firebase emulators:exec` (root `npm run test:emulator`) exports
 * `FIRESTORE_EMULATOR_HOST` and `GCLOUD_PROJECT` for the Admin SDK; the
 * values below are only a fallback for running this config directly against
 * an already-started emulator, and always point at the offline `demo-`
 * project — never a real one.
 */
export default defineConfig({
  test: {
    include: ["test-emulator/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080",
      GCLOUD_PROJECT: process.env.GCLOUD_PROJECT ?? "demo-digitable",
    },
  },
});
