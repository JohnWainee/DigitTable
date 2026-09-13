import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

export default defineProject({
  root: import.meta.dirname,
  plugins: [react()],
  test: {
    name: "web",
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    css: false,
  },
});
