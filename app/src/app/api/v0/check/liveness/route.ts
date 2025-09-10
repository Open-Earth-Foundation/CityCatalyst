/**
 * @swagger
 * /api/v0/check/liveness:
 *   get:
 *     tags:
 *       - Check
 *     summary: Liveness probe
 *     description: Returns a simple alive status and app version.
 *     responses:
 *       200:
 *         description: Service is alive.
 */
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import pkg from "../../../../../../package.json";

export const GET = apiHandler(async () => {
  return NextResponse.json({
    message: "alive",
    version: pkg.version
  });
});
