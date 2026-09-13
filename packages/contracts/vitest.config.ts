import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: "contracts",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
