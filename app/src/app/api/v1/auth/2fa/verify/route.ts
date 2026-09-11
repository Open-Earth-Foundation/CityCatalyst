/**
 * @swagger
 * /api/v1/auth/2fa/verify:
 *   post:
 *     tags:
 *       - auth
 *     operationId: verify2FA
 *     summary: Verify a second factor code from the authenticator app to enable 2FA auth
 *     description: Verifies the 2FA code in the request against the user's stored 2FA secret and enabled two factor authentication if it's valid
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
 *                 description: 2FA code coming from authenticator app, to be verified to complete 2FA setup
 *     responses:
 *       200:
 *         description: Successfully enabled two factor authentication for the user
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
 *         description: Invalid user data, 2FA setup hasn't been initialized or invalid token. Use route /v1/auth/2fa/setup first.
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

const verify2FARequest = z.object({
  token: z.string().min(1),
});

export const POST = apiHandler(async (req, { session }) => {
  const body = verify2FARequest.parse(await req.json());
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
  if (!user.twoFactorSecret) {
    throw new createHttpError.BadRequest("2FA setup is not initialized");
  }

  const isValid = verifyToken(body.token, user.twoFactorSecret);
  if (!isValid) {
    throw new createHttpError.BadRequest("Invalid 2FA token");
  }

  user.twoFactorEnabled = true;
  await user.save();

  return NextResponse.json({ data: { success: true } });
});
