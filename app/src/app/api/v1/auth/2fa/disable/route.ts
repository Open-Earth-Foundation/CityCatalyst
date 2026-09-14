/**
 * @swagger
 * /api/v1/auth/2fa/disable:
 *   post:
 *     tags:
 *       - auth
 *     operationId: disable2FA
 *     summary: Disable the second factor authentication for the currently signed in user
 *     description: Removes the 2FA secret and disables it (can be used to reset the secret to use another app)
 *     responses:
 *       200:
 *         description: Successfully disabled the second factor authentication
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
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const POST = apiHandler(async (_req, { session }) => {
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

  user.twoFactorSecret = undefined;
  user.twoFactorEnabled = false;
  await user.save();

  return NextResponse.json({ data: { success: true } });
});
