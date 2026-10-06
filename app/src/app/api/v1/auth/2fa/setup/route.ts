/**
 * @swagger
 * /api/v1/auth/2fa/setup:
 *   post:
 *     tags:
 *       - auth
 *     operationId: setup2FA
 *     summary: Create a second factor authentication secret
 *     description: Creates a 2FA secret for the currently signed in user, stores it to the user record and returns a data URL for displaying a QR code to the user.
 *     responses:
 *       200:
 *         description: Successfully created 2FA secret and QR code data URL
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
 *                     qrCodeDataUrl:
 *                       type: string
 *                       description: Data URL that can be used as the src for an image to display the QR code for adding the two factor key to an authenticator app
 *       400:
 *         description: Invalid user data, e.g. missing email address
 *       401:
 *         description: User is not authenticated or lacks valid session
 *       500:
 *         description: Internal server error
 */
import { generateQRCode, generateTwoFactorSecret } from "@/lib/2fa";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const POST = apiHandler(async (req, { session }) => {
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
  if (!user.email) {
    throw new createHttpError.BadRequest("User has no email address assigned");
  }

  if (user.twoFactorEnabled && user.twoFactorSecret != null) {
    throw new createHttpError.BadRequest(
      "User already has 2FA configured, disable it first before calling this route",
    );
  }

  const { secret, otpAuthUrl } = generateTwoFactorSecret(user.email);
  const qrCodeDataUrl = await generateQRCode(otpAuthUrl);

  user.twoFactorSecret = secret;
  await user.save();

  return NextResponse.json({ data: { success: true, qrCodeDataUrl } });
});
