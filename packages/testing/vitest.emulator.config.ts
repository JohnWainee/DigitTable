import { defineConfig } from "vitest/config";

/**
 * A separate, opt-in Vitest project for the Firebase Emulator Suite smoke
 * tests (Phase 2 PR 1, docs/PHASE_2_PLAN.md). Deliberately NOT listed in the
 * root `vitest.config.ts`'s `test.projects`: these tests require the
 * Firestore/RTDB/Auth emulators (and therefore a JVM) to be running, unlike
 * every other suite in this repository, so they must never run as part of
 * the default `npm run test`. Run them via `npm run test:emulator`, which
 * wraps this config in `firebase emulators:exec` (see the root
 * `package.json`).
 */
export default defineConfig({
  test: {
    include: ["test-emulator/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
