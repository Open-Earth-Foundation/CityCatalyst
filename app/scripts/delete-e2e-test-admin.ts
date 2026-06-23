/**
 * Removes the Playwright E2E admin user and dependent rows from the database.
 * Used by global-setup (pre-clean) and global-teardown.
 */
import { db } from "@/models";
import env from "@next/env";
import { logger } from "@/services/logger";
import { Transaction } from "sequelize";

async function deleteUserDependents(userId: string, transaction: Transaction) {
  const { models } = db;

  await models.Version.destroy({ where: { authorId: userId }, transaction });
  await models.UserFile.destroy({ where: { userId }, transaction });
  await models.PersonalAccessToken.destroy({ where: { userId }, transaction });
  await models.ImportedInventoryFile.destroy({ where: { userId }, transaction });
  await models.OrganizationAdmin.destroy({ where: { userId }, transaction });
  await models.ProjectAdmin.destroy({ where: { userId }, transaction });
  await models.CityUser.destroy({ where: { userId }, transaction });
  await models.ProjectInvite.destroy({ where: { userId }, transaction });
  await models.OrganizationInvite.destroy({ where: { userId }, transaction });
  await models.OAuthClientAuthz.destroy({ where: { userId }, transaction });
  await models.CityInvite.destroy({ where: { invitingUserId: userId }, transaction });
  await models.CityInvite.destroy({ where: { userId }, transaction });
  await models.HighImpactActionRanking.destroy({ where: { userId }, transaction });
}

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

  const user = await db.models.User.findOne({ where: { email } });
  if (!user) {
    logger.info(`No E2E test admin user found (${email})`);
    await db.sequelize?.close();
    return;
  }

  await db.sequelize!.transaction(async (transaction) => {
    await deleteUserDependents(user.userId, transaction);
    await user.destroy({ transaction });
  });

  logger.info(`Deleted E2E test admin user (${email})`);
  await db.sequelize?.close();
}

deleteE2eTestAdmin().catch((error) => {
  logger.error(error, "Failed to delete E2E test admin user");
  process.exit(1);
});
