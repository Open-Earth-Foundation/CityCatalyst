import { smtpOptions } from "@/lib/email";
import AdminNotificationTemplate from "@/lib/emails/AdminNotificationTemplate";
import { City } from "@/models/City";
import { User } from "@/models/User";
import { UserFileResponse } from "@/util/types";
import { render } from "@react-email/components";
import nodemailer, { Transporter } from "nodemailer";

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: any;
}

class NotificationService {
  private static instance: NotificationService;
  private static transporter: Transporter;

  private constructor(transporter?: Transporter) {}

  static getInstance(transporter?: Transporter): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService(transporter);
    }

    return NotificationService.instance;
  }

  static async sendEmail({
    to,
    subject,
    text,
    html,
  }: EmailOptions): Promise<SendEmailResponse> {
    const mailOptions = {
      from: process.env.SMTP_FROM_EMAIL,
      to,
      subject,
      text,
      html,
    };

    try {
      const transporter = nodemailer.createTransport({ ...smtpOptions });
      const info = await transporter.sendMail(mailOptions);
      console.log("Message sent: %s", info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("Error sending email:", error);
      return { success: false, error };
    }
  }

  static async sendNotificationEmail({
    user,
    fileData,
    city,
  }: {
    user: { name: string; email: string };
    fileData: UserFileResponse;
    city: City;
  }) {
    await NotificationService.sendEmail({
      to: process.env.ADMIN_EMAILS!,
      subject: "CityCatalyst File Upload",
      text: "City Catalyst",
      html: render(
        AdminNotificationTemplate({
          adminNames: process.env.ADMIN_NAMES!,
          file: fileData,
          user: {
            cityName: city.name!,
            email: user?.email!,
            name: user?.name!,
          },
        }),
      ),
    });
  }
}

export default NotificationService;
