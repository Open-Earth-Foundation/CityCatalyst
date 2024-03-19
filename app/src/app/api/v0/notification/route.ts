import { sendEmail } from "@/lib/email";
import AdminNotificationTemplate from "@/lib/emails/AdminNotificationTemplate";
import ForgotPasswordTemplate from "@/lib/emails/ForgotPasswordTemplate";
import { apiHandler } from "@/util/api";
import { render } from "@react-email/components";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const POST = apiHandler(
  async (req: NextRequest, { params, session }) => {
    const body = await req.json();

    const sendNotification = await sendEmail({
      to: process.env.ADMIN_EMAILS!,
      subject: "CityCatalyst - New(s) File Uploaded",
      html: render(
        AdminNotificationTemplate({
          user: {
            name: session?.user.name!,
            email: session?.user.email!,
            cityName: body.cityName!,
          },
          adminNames: process.env.ADMIN_NAMES!,
          files: body.files,
        }),
      ),
    });

    if (!sendNotification) {
      throw new createHttpError.BadRequest(
        "Error occured while sending email!",
      );
    }

    return NextResponse.json({
      data: "Admininstrators have been notified",
    });
  },
);
