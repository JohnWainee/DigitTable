import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: "playtest-scripts",
    environment: "node",
    include: ["test/**/*.test.mjs"],
  },
});
