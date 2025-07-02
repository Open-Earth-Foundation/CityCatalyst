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
import i18next from "i18next";
import { LANGUAGES } from "@/util/types";

export const POST = apiHandler(async (req) => {
  const body = forgotRequest.parse(await req.json());

  if (!process.env.RESET_TOKEN_SECRET) {
    logger.error("Need to assign RESET_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  const user = await db.models.User.findOne({ where: { email: body.email } });
  if (!user) {
    throw createHttpError.NotFound("user-not-found");
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
