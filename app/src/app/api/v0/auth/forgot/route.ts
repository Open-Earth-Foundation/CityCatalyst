/**
 * @swagger
 * /api/v0/auth/forgot:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Request a password reset email for a user account.
 *     description: Generates a short‑lived reset token and emails the reset link if the user exists. No authentication is required, and responses are always 200 to avoid revealing account existence. Requires server email and secret configuration.
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
 *     responses:
 *       200:
 *         description: Empty body to acknowledge request.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               example:
 *                 value: {}
 *       500:
 *         description: Configuration error.
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
