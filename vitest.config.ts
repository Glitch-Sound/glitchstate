import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/core/**/*.test.ts",
      "tests/webview/**/*.test.ts",
      "tests/webview/**/*.test.tsx",
      "tests/extension/**/*.test.ts",
    ],
  },
});
