/**
 * @swagger
 * /api/v0/check/liveness:
 *   get:
 *     tags:
 *       - Check
 *     summary: Report liveness status and version.
 *     description: Public endpoint that reports if the service process is responsive and includes the version string. Does not require authentication. Use it for container/process liveness checks.
 *     responses:
 *       200:
 *         description: Alive status and version.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 version:
 *                   type: string
 *             examples:
 *               example:
 *                 value:
 *                   message: "alive"
 *                   version: "0.99.0-dev.0"
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
