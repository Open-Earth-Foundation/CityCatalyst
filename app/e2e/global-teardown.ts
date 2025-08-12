import { exec } from "child_process";
import { promisify } from "util";
import { TEST_ADMIN_EMAIL } from "./test-constants";

const execAsync = promisify(exec);

async function globalTeardown() {
  console.log("Cleaning up E2E test admin user...");
  
  try {
    const { stdout: deleteOutput } = await execAsync(`
      npx tsx -e "(async () => {
        const { db } = await import('./src/models/index.js');
        const env = await import('@next/env');
        const projectDir = process.cwd();
        env.default.loadEnvConfig(projectDir);
        if (!db.initialized) await db.initialize();
        const deleted = await db.models.User.destroy({ where: { email: '${TEST_ADMIN_EMAIL}' } });
        console.log(deleted > 0 ? 'Deleted test admin user' : 'No test admin user found to delete');
        await db.sequelize?.close();
      })()"
    `);
    console.log("Teardown completed:", deleteOutput.trim());
  } catch (cleanupError) {
    console.log("Teardown failed:", cleanupError);
    // Don't fail if cleanup fails - just log it
  }
}

export default globalTeardown;