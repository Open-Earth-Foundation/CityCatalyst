/**
 * @swagger
 * /api/v1/auth/2fa/login:
 *   post:
 *     tags:
 *       - auth
 *     operationId: login2FA
 *     summary: Verify a second factor code from the authenticator app to sign in user
 *     description: Verifies the 2FA code in the request against the user's stored 2FA secret to log in
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               token:
 *                 type: string
 *                 description: 2FA code coming from authenticator app, to be verified to complete sign in
 *     responses:
 *       200:
 *         description: Successfully authenticated with second factor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *       400:
 *         description: Invalid user data, 2FA setup hasn't been set up or invalid token. Use route /v1/auth/2fa/setup first.
 *       401:
 *         description: User is not authenticated or lacks valid session
 *       500:
 *         description: Internal server error
 */
import { verifyToken } from "@/lib/2fa";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import z from "zod";

const login2FARequest = z.object({
  token: z.string().min(1),
});

export const POST = apiHandler(async (req, { session }) => {
  const body = login2FARequest.parse(await req.json());
  if (!session) {
    throw new createHttpError.Unauthorized(
      "Not signed in as the requested user",
    );
  }

  const user = await db.models.User.findOne({
    where: { userId: session.user.id },
  });
  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }
  if (!user.twoFactorSecret || !user.twoFactorEnabled) {
    throw new createHttpError.BadRequest("2FA is not set up for user");
  }

  const isValid = verifyToken(body.token, user.twoFactorSecret);
  if (!isValid) {
    throw new createHttpError.BadRequest("Invalid 2FA token");
  }

  // TODO can we update the session from the server side here for more security?

  return NextResponse.json({ data: { success: true } });
});
