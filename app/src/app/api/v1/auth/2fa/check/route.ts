/**
 * @swagger
 * /api/v1/auth/2fa/check:
 *   get:
 *     tags:
 *       - auth
 *     operationId: check2FA
 *     summary: Check if second factor authentication is enabled for a given email address
 *     description: Queries the user record for a given email address and returns if second factor authentication is enabled for it. Does not need an active session so it can be used on the login screen.
 *     responses:
 *       200:
 *         description: Successfully queried user 2FA status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: User with given email address not found
 *       500:
 *         description: Internal server error
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import z from "zod";

const check2FAQuery = z.object({
  email: z.string().email(),
});

export const GET = apiHandler(async (_req, { searchParams }) => {
  const { email } = check2FAQuery.parse(searchParams);
  const user = await db.models.User.findOne({
    where: { email },
  });
  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  const enabled = user.twoFactorEnabled && user.twoFactorSecret;
  return NextResponse.json({ data: { enabled } });
});
