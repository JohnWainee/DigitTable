import { assertFails, type RulesTestContext } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createEmulatorTestEnvironment,
  isAuthEmulatorReachable,
  type RulesTestEnvironment,
} from "../src/emulator.js";

/**
 * Phase 2 PR 1's required emulator-harness proof (docs/PHASE_2_PLAN.md,
 * "This PR proves the harness boots and a trivial read/write round-trips
 * against the emulator."). Run via `npm run test:emulator` (root
 * `package.json`), which wraps this suite in `firebase emulators:exec` so
 * the Auth/Firestore/RTDB emulators are started before and torn down after.
 * Never part of `npm run test` — these tests cannot run without the
 * emulators (and the JVM they require) present.
 *
 * As of Phase 2 PR 2, `firestore.rules`/`database.rules.json` implement the
 * real room data model's authorization (see
 * `firestoreRoomRules.security.test.ts` and
 * `rtdbPresenceRules.security.test.ts` for that allow/deny matrix). This
 * suite only proves the harness itself — connectivity and a read/write round
 * trip through `@firebase/rules-unit-testing`'s rules-disabled trusted
 * context — using an arbitrary `smoke/ping` path outside the room data
 * model's collections, which both rule sets' unmatched-path catch-alls deny
 * to every non-trusted context.
 */
describe("Firebase Emulator Suite harness (Phase 2 PR 1)", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await createEmulatorTestEnvironment();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("the Auth emulator is reachable", async () => {
    expect(await isAuthEmulatorReachable()).toBe(true);
  });

  it("Firestore denies an unauthenticated write outside the room data model", async () => {
    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(unauthed.firestore().collection("smoke").doc("ping").set({ ok: true }));
  });

  it("a trusted (rules-disabled) context round-trips a Firestore read/write", async () => {
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      const doc = context.firestore().collection("smoke").doc("ping");
      await doc.set({ ok: true });
      const snapshot = await doc.get();
      expect(snapshot.exists).toBe(true);
      expect(snapshot.data()).toEqual({ ok: true });
    });
  });

  it("RTDB denies an unauthenticated write outside the presence subtree", async () => {
    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(unauthed.database().ref("smoke/ping").set({ ok: true }));
  });

  it("a trusted (rules-disabled) context round-trips an RTDB read/write", async () => {
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      const ref = context.database().ref("smoke/ping");
      await ref.set({ ok: true });
      const snapshot = await ref.once("value");
      expect(snapshot.val()).toEqual({ ok: true });
    });
  });
});
