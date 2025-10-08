/**
 * @swagger
 * /api/v1/auth/forgot:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Request a password reset email for a user account.
 *     description: Generates a short‑lived JWT reset token (valid for 1 hour) and sends a password reset email if the user exists. For security, this endpoint always returns 200 regardless of whether the email exists to prevent account enumeration. Requires proper email configuration and RESET_TOKEN_SECRET environment variable.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address of the account to reset password for
 *     responses:
 *       200:
 *         description: Password reset request acknowledged. Check email if account exists.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               example:
 *                 value: {}
 *       422:
 *         description: Invalid email format or validation error.
 *       500:
 *         description: Configuration error, email service unavailable, or internal server error.
 */
import { sendEmail } from "@/lib/email";
import ForgotPasswordTemplate from "@/lib/emails/ForgotPasswordTemplate";
import { apiHandler } from "@/util/api";
import { forgotRequest } from "@/util/validation";
import { render } from "@react-email/components";
import createHttpError from "http-errors";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { logger } from "@/services/logger";
import { db } from "@/models";
import i18next from "@/i18n/server";
import { LANGUAGES } from "@/util/types";

export const POST = apiHandler(async (req) => {
  const body = forgotRequest.parse(await req.json());

  if (!process.env.RESET_TOKEN_SECRET) {
    logger.error("Need to assign RESET_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  const user = await db.models.User.findOne({ where: { email: body.email } });
  if (!user) {
    logger.error(
      { email: body.email },
      "User not found for resetting password",
    );
    // silent failure (for user) for security reasons
    return NextResponse.json({});
  }

  const resetToken = jwt.sign(
    { email: body.email },
    process.env.RESET_TOKEN_SECRET,
    {
      expiresIn: "1h",
    },
  );
  const host = process.env.HOST ?? "http://localhost:3000";
  const resetUrl =
    host + "/auth/update-password?token=" + encodeURIComponent(resetToken);

  const html = await render(
    ForgotPasswordTemplate({
      url: resetUrl,
      language: user?.preferredLanguage,
    }),
  );

  const translatedSubject = i18next.t("reset-password.subject", {
    lng: user?.preferredLanguage || LANGUAGES.en,
    ns: "emails",
  });
  await sendEmail({
    to: body.email,
    subject: translatedSubject,
    html,
  });

  return NextResponse.json({});
});
