import { defineConfig } from "@playwright/test";
import fundingConfig from "./funding.playwright.config";

// Like the funding suite, use a running app with CNB enabled and an
// authenticated storage state (CNB_TEST_URL and CNB_AUTH_STATE).
export default defineConfig(fundingConfig, {
  testMatch: "concept-note-deletion.spec.ts",
  outputDir: "../../artifacts/cc872/browser",
});
