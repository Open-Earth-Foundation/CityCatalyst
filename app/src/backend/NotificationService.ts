import { smtpOptions } from "@/lib/email";
import AdminNotificationTemplate from "@/lib/emails/AdminNotificationTemplate";
import { City } from "@/models/City";
import { LANGUAGES, UserFileResponse } from "@/util/types";
import { render } from "@react-email/components";
import nodemailer, { Transporter } from "nodemailer";
import { logger } from "@/services/logger";
import EmailService from "./EmailService";

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
      // TODO use cached `transporter` from class
      const transporter = nodemailer.createTransport({ ...smtpOptions });
      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error({ err: error }, "Error sending email:");
      return { success: false, error };
    }
  }

  static async sendNotificationEmail({
    user,
    fileData,
    city,
    inventoryId,
  }: {
    user: { name: string; email: string; preferredLanguage: LANGUAGES };
    fileData: UserFileResponse;
    city: City;
    inventoryId: string;
  }) {
    const html = await render(
      AdminNotificationTemplate({
        adminNames: process.env.ADMIN_NAMES!,
        file: fileData,
        user: {
          cityName: city.name!,
          email: user?.email!,
          name: user?.name!,
        },
        inventoryId,
        language: user.preferredLanguage,
      }),
    );
    const translatedSubject = EmailService.getTranslation(
      user,
      "admin-notification.subject",
    ).subject;

    await NotificationService.sendEmail({
      to: process.env.ADMIN_EMAILS!,
      subject: translatedSubject,
      text: "City Catalyst",
      html,
    });
  }
}

export default NotificationService;
