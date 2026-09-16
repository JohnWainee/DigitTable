export * from "./builders.js";
export * from "./projectionIsolation.js";
export * from "./fakeTemplate.js";
// Board task A05: apps/web's own emulator integration tests need this
// harness too (to seed fixture data past firestore.rules, the same way
// packages/testing/test-emulator/roomRules.test.ts already does), not only
// packages/testing's own test-emulator/ suite — publicly exported rather
// than duplicated.
export {
  createEmulatorTestEnvironment,
  DEMO_PROJECT_ID,
  isAuthEmulatorReachable,
} from "./emulator.js";
export type { RulesTestEnvironment } from "./emulator.js";
