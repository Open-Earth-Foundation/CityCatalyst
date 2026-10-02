import { existsSync } from "node:fs";

import { openai } from "@ai-sdk/openai";
import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";

// Agent steps need OPENAI_API_KEY. Locally it lives in .env.local; CI exports it.
for (const file of [".env.local", ".env"]) {
  if (!process.env.OPENAI_API_KEY && existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const appUrl = process.env.E2E_APP_URL ?? "http://localhost:3000";
const appOrigin = new URL(appUrl).origin;

export default {
  tests: ["e2e-agent/**/*.e2e.ts"],
  timeout: 300_000,
  actionTimeout: 30_000,
  assertionTimeout: 15_000,
  targets: [
    {
      name: "chromium",
      engine: web({
        browser: "chromium",
        viewport: { width: 1440, height: 900 },
      }),
      app: {
        url: appUrl,
        // Same server the Playwright suite uses: a production build on `next start`.
        command: {
          executable: "node",
          args: ["node_modules/next/dist/bin/next", "start", "-p", "{port}"],
          env: {
            NODE_ENV: "test",
            PLAYWRIGHT_TEST: "1",
            NEXTAUTH_URL: appOrigin,
            HOST: appOrigin,
          },
          startupTimeout: 120_000,
          reuseExisting: true,
          log: ".e2e/app.log",
        },
      },
    },
  ],
  agents: {
    default: {
      model: openai(process.env.E2E_MODEL ?? "gpt-6-luna"),
      context: [
        "CityCatalyst helps cities build greenhouse gas (GHG) emission inventories",
        "following the GPC protocol. Sectors contain subsectors (e.g. Stationary",
        "energy > Residential buildings); each subsector has Scope 1 / Scope 2 tabs",
        "where activities are added through an 'Add activity' modal.",
        "Never decline or dismiss work in progress unless the goal asks for it.",
      ].join(" "),
    },
  },
  reporters: ["list", "markdown"],
} satisfies E2EConfig;
