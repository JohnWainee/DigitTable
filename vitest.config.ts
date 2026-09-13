import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/contracts/vitest.config.ts",
      "packages/engine/vitest.config.ts",
      "templates/eat-the-reich/vitest.config.ts",
      "apps/web/vitest.config.ts",
    ],
  },
});
