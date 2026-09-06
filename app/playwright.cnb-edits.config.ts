import { defineConfig, devices } from "@playwright/test";

// A separate local fixture avoids the unrelated server already using port 3000.
const baseURL = process.env.CNB_EDIT_TEST_BASE_URL ?? "http://127.0.0.1:3410";
const target = new URL(baseURL);
if (target.protocol !== "http:" || target.hostname !== "127.0.0.1") {
  throw new Error("CNB browser tests require an isolated loopback app");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/cnb-edits", open: "never" }],
  ],
  outputDir: "test-results/cnb-edits",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: "cnb-edit-auth.setup.ts" },
    {
      name: "chromium",
      testMatch: "concept-note-chat-edits.spec.ts",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/cnb-edits.json",
      },
    },
  ],
  // The local fixture may already have a server owned by this test run. CI can
  // explicitly opt into starting its freshly built app; never reuse port 3000.
  webServer:
    process.env.CNB_EDIT_START_WEB_SERVER === "1"
      ? {
          command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${target.port || "3410"}`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120_000,
          env: { NODE_ENV: "production", PLAYWRIGHT_TEST: "1" },
        }
      : undefined,
});
