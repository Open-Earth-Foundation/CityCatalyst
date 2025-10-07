/**
 * @swagger
 * /api/v0/auth/password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Set a new password using a valid reset token.
 *     description: Verifies the provided reset token and updates the user’s password. No authentication is required for this flow, only a valid token. Returns 200 with an empty object on success.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newPassword, resetToken]
 *             properties:
 *               newPassword:
 *                 type: string
 *               resetToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Empty body on success.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               example:
 *                 value: {}
 *       401:
 *         description: Invalid or expired token.
 *       404:
 *         description: User not found.
 *       500:
 *         description: Configuration error.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { resetPasswordRequest } from "@/util/validation";
import bcrypt from "bcrypt";
import createHttpError from "http-errors";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { logger } from "@/services/logger";

export const POST = apiHandler(async (req: Request) => {
  const body = resetPasswordRequest.parse(await req.json());

  if (!process.env.RESET_TOKEN_SECRET) {
    logger.error("Need to assign RESET_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  // verify reset token

  let resetTokenData;
  try {
    resetTokenData = jwt.verify(
      body.resetToken,
      process.env.RESET_TOKEN_SECRET,
    );
  } catch (error: any) {
    // handle reset token errors
    if (error.name === "TokenExpiredError") {
      throw createHttpError.Unauthorized("Reset token has expired.");
    } else {
      throw createHttpError.Unauthorized("Invalid reset token.");
    }
  }

  const email = (resetTokenData as any).email;
  const user = await db.models.User.findOne({ where: { email } });

  if (!user) {
    throw createHttpError.NotFound("User not found!");
  }

  // Update user password
  user.passwordHash = await bcrypt.hash(body.newPassword, 12);
  await user.save();

  return NextResponse.json({});
});
