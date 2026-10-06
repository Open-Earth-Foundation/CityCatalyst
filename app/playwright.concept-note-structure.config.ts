import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "concept-note-structure.spec.ts",
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: process.env.CNB_BROWSER_TEST_URL ?? "http://127.0.0.1:3046",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  reporter: "list",
});
