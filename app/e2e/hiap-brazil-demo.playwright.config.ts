import { defineConfig } from "@playwright/test";

/**
 * The Brazil Phase 3 demo is public and fixture-only: no database, no login.
 * Run against an already running app with the HIAP_BR_DEMO flag on:
 *
 *   npx playwright test -c e2e/hiap-brazil-demo.playwright.config.ts
 *
 * PW_CHANNEL=chrome uses the installed Google Chrome instead of a
 * downloaded Playwright browser.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "hiap-brazil-demo.spec.ts",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: "list",
  outputDir: "../playwright-output/hiap-brazil-demo",
  use: {
    baseURL: process.env.HIAP_DEMO_URL ?? "http://localhost:3000",
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
  },
});
