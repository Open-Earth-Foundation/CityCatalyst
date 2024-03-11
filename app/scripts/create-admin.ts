import { db } from "@/models";
import env from "@next/env";
import { randomUUID } from "node:crypto";
import { logger } from "@/services/logger";
import bcrypt from "bcrypt";
import { Roles } from "@/lib/auth";

async function createAdmin() {
  const projectDir = process.cwd();
  env.loadEnvConfig(projectDir);

  if (!db.initialized) {
    await db.initialize();
  }

  if (!process.env.DEFAULT_ADMIN_EMAIL || !process.env.DEFAULT_ADMIN_PASSWORD) {
    throw new Error(
      "Missing default admin credentials DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD in env!",
    );
  }

  const passwordHash = await bcrypt.hash(
    process.env.DEFAULT_ADMIN_PASSWORD,
    12,
  );
  const user = await db.models.User.create({
    userId: randomUUID(),
    name: "Admin",
    email: process.env.DEFAULT_ADMIN_EMAIL.toLowerCase(),
    passwordHash,
    role: Roles.Admin,
  });

  logger.info("Created admin user", user.userId);
}

createAdmin();
