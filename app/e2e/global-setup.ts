import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function globalSetup() {
  console.log("Setting up E2E test admin user...");
  
  // First, cleanup any existing broken test admin user
  try {
    const { stdout: deleteOutput } = await execAsync(`
      npx tsx -e "(async () => {
        const { db } = await import('./src/models/index.js');
        const env = await import('@next/env');
        const projectDir = process.cwd();
        env.default.loadEnvConfig(projectDir);
        if (!db.initialized) await db.initialize();
        await db.models.User.destroy({ where: { email: 'e2e-test-admin@citycatalyst.local' } });
        console.log('Cleaned up existing test admin user');
        await db.sequelize?.close();
      })()"
    `);
    console.log("Cleanup completed:", deleteOutput.trim());
  } catch (cleanupError) {
    console.log("Cleanup failed (user might not exist):", cleanupError);
  }
  
  // Now create the admin user
  try {
    const { stdout, stderr } = await execAsync("npm run create-admin", {
      env: {
        ...process.env,
        DEFAULT_ADMIN_EMAIL: "e2e-test-admin@citycatalyst.local",
        DEFAULT_ADMIN_PASSWORD: "E2ETestAdmin123!"
      }
    });
    
    console.log("Admin setup completed:", stdout.trim());
    if (stderr) console.log("Admin setup stderr:", stderr);
  } catch (error) {
    console.log("Admin setup error:", error);
    // Don't fail the whole test suite if admin creation fails
  }

}

export default globalSetup;