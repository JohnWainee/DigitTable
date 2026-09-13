import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: "template-eat-the-reich",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
