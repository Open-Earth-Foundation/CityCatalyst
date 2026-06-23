/**
 * Removes the Playwright E2E admin user from the database.
 * Used by global-setup (pre-clean) and global-teardown.
 */
import { db } from "@/models";
import env from "@next/env";
import { logger } from "@/services/logger";

async function deleteE2eTestAdmin() {
  const email = process.env.E2E_TEST_ADMIN_EMAIL?.toLowerCase();
  if (!email) {
    logger.error(
      "delete-e2e-test-admin.ts: E2E_TEST_ADMIN_EMAIL environment variable is required",
    );
    process.exit(1);
  }

  const projectDir = process.cwd();
  env.loadEnvConfig(projectDir);

  if (!db.initialized) {
    await db.initialize();
  }

  const deleted = await db.models.User.destroy({ where: { email } });
  logger.info(
    deleted > 0
      ? `Deleted E2E test admin user (${email})`
      : `No E2E test admin user found (${email})`,
  );

  await db.sequelize?.close();
}

deleteE2eTestAdmin().catch((error) => {
  logger.error(error, "Failed to delete E2E test admin user");
  process.exit(1);
});
