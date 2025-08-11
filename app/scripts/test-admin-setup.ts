import { db } from "@/models";
import env from "@next/env";
import { randomUUID } from "node:crypto";
import { logger } from "@/services/logger";
import bcrypt from "bcrypt";
import { Roles } from "@/util/types";

// Test admin credentials - clearly identifiable as test data
export const TEST_ADMIN_EMAIL = "e2e-test-admin@citycatalyst.local";
export const TEST_ADMIN_PASSWORD = "E2ETestAdmin123!";
export const TEST_ADMIN_NAME = "E2E Test Admin";

/**
 * Initialize database connection for test scripts
 */
async function initializeDatabase() {
  const projectDir = process.cwd();
  env.loadEnvConfig(projectDir);

  if (!db.initialized) {
    await db.initialize();
  }
}

/**
 * Clean up any existing test admin users
 * This is idempotent - safe to run multiple times
 */
export async function cleanupTestAdmin() {
  await initializeDatabase();

  try {
    // Find and delete any test admin users
    const testAdmins = await db.models.User.findAll({
      where: {
        email: TEST_ADMIN_EMAIL.toLowerCase()
      }
    });

    if (testAdmins.length > 0) {
      await db.models.User.destroy({
        where: {
          email: TEST_ADMIN_EMAIL.toLowerCase()
        }
      });
      logger.info(`Cleaned up ${testAdmins.length} test admin user(s)`);
    } else {
      logger.info("No test admin users to clean up");
    }
  } catch (error) {
    logger.error("Error during test admin cleanup:", error);
    throw error;
  }
}

/**
 * Create test admin user for E2E tests
 * This is idempotent - safe to run multiple times
 */
export async function createTestAdmin() {
  await initializeDatabase();

  try {
    // First cleanup any existing test admin
    await cleanupTestAdmin();

    // Create new test admin user
    const passwordHash = await bcrypt.hash(TEST_ADMIN_PASSWORD, 12);
    const user = await db.models.User.create({
      userId: randomUUID(),
      name: TEST_ADMIN_NAME,
      email: TEST_ADMIN_EMAIL.toLowerCase(),
      passwordHash,
      role: Roles.Admin,
    });

    logger.info(
      "Created E2E test admin user with email %s and ID %s",
      user.email,
      user.userId,
    );

    return user;
  } catch (error) {
    logger.error("Error creating test admin:", error);
    throw error;
  }
}

/**
 * Cleanup and close database connection
 */
export async function closeDatabase() {
  try {
    await db.sequelize?.close();
    logger.info("Database connection closed");
  } catch (error) {
    logger.error("Error closing database:", error);
  }
}

// If this script is run directly, create the test admin
if (typeof require !== 'undefined' && require.main === module) {
  (async () => {
    try {
      await createTestAdmin();
      await closeDatabase();
    } catch (error) {
      logger.error("Failed to create test admin:", error);
      process.exit(1);
    }
  })();
}