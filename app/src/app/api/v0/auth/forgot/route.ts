import { sendEmail } from "@/lib/email";
import ForgotPasswordTemplate from "@/lib/emails/ForgotPasswordTemplate";
import { apiHandler } from "@/util/api";
import { forgotRequest } from "@/util/validation";
import { render } from "@react-email/components";
import createHttpError from "http-errors";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

export const POST = apiHandler(async (req) => {
  const body = forgotRequest.parse(await req.json());

  if (!process.env.RESET_TOKEN_SECRET) {
    console.error("Need to assign RESET_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
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

  const html = await render(ForgotPasswordTemplate({ url: resetUrl }));
  await sendEmail({
    to: body.email,
    subject: "CityCatalyst - Reset your password",
    html,
  });

  return NextResponse.json({});
});
