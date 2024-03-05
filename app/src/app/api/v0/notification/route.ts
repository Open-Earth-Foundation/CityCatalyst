import { sendEmail } from "@/lib/email";
import ForgotPasswordTemplate from "@/lib/emails/ForgotPasswordTemplate";
import { apiHandler } from "@/util/api";
import { render } from "@react-email/components";
import { NextRequest, NextResponse } from "next/server";

export const POST = apiHandler(async (req: NextRequest, context) => {
  const body = await req.json();
  console.log(body);
  await sendEmail({
    to: process.env.ADMIN_EMAILS!,
    subject: "CityCatalyst - New(s) File Uploaded",
    html: render(ForgotPasswordTemplate({ url: "/" })),
  });

  return NextResponse.json({
    data: "Admininstrators have been notified",
  });
});
