/**
 * @swagger
 * /api/v0/user/whoami:
 *   get:
 *     tags:
 *       - User
 *     summary: Get current session's user data
 *     responses:
 *       200:
 *         description: Session user returned.
 *       401:
 *         description: Not signed in.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

/** Return user data */

export const GET = apiHandler(async (_req, { params, session }) => {

  if (!session) {
    throw new createHttpError.Unauthorized(
      "Not signed in as the requested user",
    );
  }

  return NextResponse.json({
    data: session.user
  });
})
