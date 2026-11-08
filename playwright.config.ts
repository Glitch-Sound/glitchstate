import { defineConfig } from "@playwright/test";

const PREVIEW_PORT = 5186;
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}`;

export default defineConfig({
  testDir: "./tests/visual",
  use: { baseURL: PREVIEW_URL },
  webServer: {
    command: `corepack pnpm exec vite --host 127.0.0.1 --port ${PREVIEW_PORT} --strictPort`,
    url: PREVIEW_URL,
    reuseExistingServer: false,
  },
});
