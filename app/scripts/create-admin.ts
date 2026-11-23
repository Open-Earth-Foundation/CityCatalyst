import { db } from "@/models";
import env from "@next/env";
import { randomUUID } from "node:crypto";
import { logger } from "@/services/logger";
import { Roles } from "@/util/types";

/**
 * Creates a CityCatalyst profile row for the default admin email.
 * Credentials live in core-identity-service (CC-1283); register/sign in there
 * with the same email, using the same userId as `sub` if you seed identity.
 */
async function createAdmin() {
  const projectDir = process.cwd();
  env.loadEnvConfig(projectDir);

  if (!db.initialized) {
    await db.initialize();
  }

  if (!process.env.DEFAULT_ADMIN_EMAIL) {
    logger.error(
      "create-admin.ts: Missing DEFAULT_ADMIN_EMAIL in env!",
    );
    await db.sequelize?.close();
    return;
  }

  const email = process.env.DEFAULT_ADMIN_EMAIL.toLowerCase();
  const user = await db.models.User.findOne({ where: { email } });

  if (user) {
    logger.info("Admin user already exists. Exiting.");
    await db.sequelize?.close();
    return;
  }

  const newUser = await db.models.User.create({
    userId: randomUUID(),
    name: "admin",
    email: email,
    role: Roles.Admin,
  });

  logger.info(
    "Created admin profile with email %s and ID %s. Create matching credentials in core-identity-service (same user_id as OpenID sub).",
    newUser.email as string,
    newUser.userId,
  );
  await db.sequelize?.close();
}

createAdmin();
