import { exec } from "child_process";
import { promisify } from "util";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "./test-constants";

const execAsync = promisify(exec);

async function globalSetup() {
  const startTime = Date.now();
  console.log(
    `[GLOBAL-SETUP] Starting E2E test admin user setup at ${new Date().toISOString()}`,
  );
  console.log(
    `[GLOBAL-SETUP] Environment: CI=${process.env.CI}, NODE_ENV=${process.env.NODE_ENV}`,
  );

  // Remove any leftover E2E admin from a prior run
  try {
    console.log("[GLOBAL-SETUP] Starting cleanup of existing test admin user...");
    const { stdout: deleteOutput } = await execAsync(
      "npx tsx scripts/delete-e2e-test-admin.ts",
      {
        env: {
          ...process.env,
          E2E_TEST_ADMIN_EMAIL: TEST_ADMIN_EMAIL,
        },
        timeout: 30000,
      },
    );
    console.log("[GLOBAL-SETUP] Cleanup completed:", deleteOutput.trim());
  } catch (cleanupError) {
    console.log(
      "[GLOBAL-SETUP] Cleanup failed (user might not exist):",
      cleanupError,
    );
  }

  try {
    console.log("[GLOBAL-SETUP] Creating admin user...");
    const { stdout, stderr } = await execAsync("npm run create-admin", {
      env: {
        ...process.env,
        DEFAULT_ADMIN_EMAIL: TEST_ADMIN_EMAIL,
        DEFAULT_ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
      },
      timeout: 60000,
    });

    console.log("[GLOBAL-SETUP] Admin setup completed:", stdout.trim());
    if (stderr) console.log("[GLOBAL-SETUP] Admin setup stderr:", stderr);
  } catch (error) {
    console.log("[GLOBAL-SETUP] Admin setup error:", error);
  }

  const duration = Date.now() - startTime;
  console.log(
    `[GLOBAL-SETUP] Global setup completed in ${duration}ms at ${new Date().toISOString()}`,
  );
}

export default globalSetup;
