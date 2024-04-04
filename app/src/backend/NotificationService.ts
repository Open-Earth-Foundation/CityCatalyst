import { smtpOptions } from "@/lib/email";
import nodemailer, { Transporter } from "nodemailer";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: any;
}

class NotificationService {
  private transporter: Transporter;
  constructor() {
    this.transporter = nodemailer.createTransport({ ...smtpOptions });
  }

  async sendEmail({
    to,
    subject,
    text,
    html,
  }: EmailOptions): Promise<SendEmailResponse> {
    const mailOptions = {
      from: "",
      to,
      subject,
      text,
      html,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log("Message sent: %s", info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("Error sending email:", error);
      return { success: false, error };
    }
  }
}

export default NotificationService;
