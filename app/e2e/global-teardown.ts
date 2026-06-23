import { exec } from "child_process";
import { promisify } from "util";
import { TEST_ADMIN_EMAIL } from "./test-constants";

const execAsync = promisify(exec);

async function globalTeardown() {
  console.log("Cleaning up E2E test admin user...");

  try {
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
    console.log("Teardown completed:", deleteOutput.trim());
  } catch (cleanupError) {
    console.log("Teardown failed:", cleanupError);
    // Don't fail the suite if cleanup fails — log only
  }
}

export default globalTeardown;
