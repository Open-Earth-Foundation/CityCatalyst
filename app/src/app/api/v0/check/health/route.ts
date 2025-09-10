/**
 * @swagger
 * /api/v0/check/health:
 *   get:
 *     tags:
 *       - Check
 *     summary: Health check
 *     description: Returns application health status and version; checks database connectivity.
 *     responses:
 *       200:
 *         description: Service is healthy.
 *       500:
 *         description: Database connection failed.
 */
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import pkg from "../../../../../../package.json";
import { db } from "@/models/index";
import { logger } from "@/services/logger";

let lastCheckTime = 0;
let lastCheckResult = false;
const CACHE_TTL = 5000; // 5 seconds

const checkDatabase = async () => {
  const now = Date.now();
  if (now - lastCheckTime < CACHE_TTL) {
    return lastCheckResult;
  }
  try {
    await db.sequelize?.query("SELECT 1");
    lastCheckResult = true;
  } catch (error: any) {
    lastCheckResult = false;
    logger.error(
      "Database connection is not working: " + (error instanceof Error)
        ? error.message
        : "unknown reason",
    );
  }
  lastCheckTime = now;
  return lastCheckResult;
};

export const GET = apiHandler(async () => {
  if (!db.initialized) {
    throw new Error("Database not yet initialized");
  }

  const result = await checkDatabase();

  if (result) {
    return NextResponse.json({
      message: "healthy",
      version: pkg.version,
    });
  } else {
    return NextResponse.json(
      {
        message: "database-connection-failed",
        version: pkg.version,
      },
      { status: 500 },
    );
  }
});

