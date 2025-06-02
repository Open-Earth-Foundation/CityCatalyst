import nodemailer from "nodemailer";
import { logger } from "@/services/logger";

type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
};

export const smtpOptions = {
  host: process.env.SMTP_HOST || "localhost",
  port: parseInt(process.env.SMTP_PORT || "2525"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "user",
    pass: process.env.SMTP_PASSWORD || "password",
  },
};

const emailFrom = process.env.SMTP_FROM_EMAIL || "citycatalyst@localhost";

export const sendEmail = async (data: EmailPayload) => {
  try {
    if (!data.to) {
      throw new Error("Missing recipient email address");
    }
    if (!data.subject) {
      throw new Error("Missing email subject");
    }
    if (!data.html) {
      throw new Error("Missing required email fields");
    }

    logger.info(
      `Sending email from ${emailFrom} to ${Array.isArray(data.to) ? data.to.join(",") : data.to} with subject ${data.subject} (${data.html.length} characters)`,
    );

    logger.debug(
      `Connecting to SMTP server at ${smtpOptions.host}:${smtpOptions.port}`,
    );
    logger.debug(`SMTP user: ${smtpOptions.auth.user}`);
    logger.debug(
      `SMTP password length: ${smtpOptions.auth.pass?.length} characters`,
    );

    const transporter = nodemailer.createTransport({
      ...smtpOptions,
    });

    logger.debug("Sending email...");

    const result = await transporter.sendMail({
      from: emailFrom,
      ...data,
    });

    if (!result) {
      throw new Error("Failed to send email");
    }
    if (!result.messageId) {
      throw new Error("Failed to send email");
    }
    if (!result.accepted || result.accepted.length === 0) {
      throw new Error("Failed to send email");
    }
    logger.info(`Email sent successfully: ${result.messageId}`);
    return result;
  } catch (error) {
    logger.error(`Error sending email: ${error}`);
    throw error;
  }
};
