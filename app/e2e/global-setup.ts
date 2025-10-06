import { exec } from "child_process";
import { promisify } from "util";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "./test-constants";

const execAsync = promisify(exec);

async function globalSetup() {
  const startTime = Date.now();
  console.log(`[GLOBAL-SETUP] Starting E2E test admin user setup at ${new Date().toISOString()}`);
  console.log(`[GLOBAL-SETUP] Environment: CI=${process.env.CI}, NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`[GLOBAL-SETUP] Database URL available: ${!!process.env.DATABASE_URL}`);
  
  // First, cleanup any existing broken test admin user
  try {
    console.log("[GLOBAL-SETUP] Starting cleanup of existing test admin user...");
    const { stdout: deleteOutput } = await execAsync(`
      npx tsx -e "(async () => {
        const { db } = await import('./src/models/index.js');
        const env = await import('@next/env');
        const projectDir = process.cwd();
        env.default.loadEnvConfig(projectDir);
        console.log('Loading environment config...');
        if (!db.initialized) {
          console.log('Initializing database...');
          await db.initialize();
        }
        console.log('Database initialized, cleaning up user...');
        await db.models.User.destroy({ where: { email: '${TEST_ADMIN_EMAIL}' } });
        console.log('Cleaned up existing test admin user');
        await db.sequelize?.close();
        console.log('Database connection closed');
      })()"
    `, { timeout: 30000 });
    console.log("[GLOBAL-SETUP] Cleanup completed:", deleteOutput.trim());
  } catch (cleanupError) {
    console.log("[GLOBAL-SETUP] Cleanup failed (user might not exist):", cleanupError);
  }
  
  // Now create the admin user
  try {
    console.log("[GLOBAL-SETUP] Creating admin user...");
    const { stdout, stderr } = await execAsync("npm run create-admin", {
      env: {
        ...process.env,
        DEFAULT_ADMIN_EMAIL: TEST_ADMIN_EMAIL,
        DEFAULT_ADMIN_PASSWORD: TEST_ADMIN_PASSWORD
      },
      timeout: 60000 // 1 minute timeout
    });
    
    console.log("[GLOBAL-SETUP] Admin setup completed:", stdout.trim());
    if (stderr) console.log("[GLOBAL-SETUP] Admin setup stderr:", stderr);
  } catch (error) {
    console.log("[GLOBAL-SETUP] Admin setup error:", error);
    // Don't fail the whole test suite if admin creation fails
  }

  const duration = Date.now() - startTime;
  console.log(`[GLOBAL-SETUP] Global setup completed in ${duration}ms at ${new Date().toISOString()}`);
}

export default globalSetup;