import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "template-eat-the-reich",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
