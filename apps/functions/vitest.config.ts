import { defineConfig } from "vitest/config";

/**
 * Default (no-emulator) unit tests for `apps/functions`: the pure pieces of
 * the callable boundary — throttle-window arithmetic, stable-error → gRPC
 * status mapping, caller-IP resolution — run here without Firebase. The
 * transaction and callable handlers themselves are proven against the
 * Firestore emulator by `vitest.emulator.config.ts` (`npm run test:emulator`).
 */
export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: "functions",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
