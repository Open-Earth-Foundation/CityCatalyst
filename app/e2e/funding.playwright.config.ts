import { defineConfig } from "@playwright/test";

/** Run against a local app with an authenticated test-user storage state. */
export default defineConfig({
  testDir: ".",
  testMatch: "concept-note-funding.spec.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: "list",
  outputDir: "../../artifacts/cc873/browser",
  use: {
    baseURL: process.env.CNB_TEST_URL ?? "http://localhost:3000",
    storageState: process.env.CNB_AUTH_STATE ?? "playwright/.auth/user.json",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
