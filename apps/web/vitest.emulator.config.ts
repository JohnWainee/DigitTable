import { defineConfig } from "vitest/config";

/**
 * Board task A05: real Functions/Firestore/Auth-emulator integration tests
 * for the client's Firebase seams (`FirebaseSessionClient`,
 * `FirebaseRoomRepository`) — the callable HTTP/SDK transport, not
 * `apps/functions`' own handler-level `.run()` proofs. Deliberately NOT
 * listed in the root `vitest.config.ts`'s `test.projects`, matching
 * `apps/functions/vitest.emulator.config.ts`: these need the full emulator
 * suite (including, for the first time, the Functions emulator) running.
 * `environment: "node"` (not `jsdom`, unlike `apps/web/vitest.config.ts`)
 * so the Firebase JS SDK's HTTP calls use Node's native `fetch` rather than
 * jsdom's incomplete network stack.
 */
export default defineConfig({
  test: {
    include: ["test-emulator/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
