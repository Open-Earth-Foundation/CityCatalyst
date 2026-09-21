import { logger } from "@/services/logger";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

// Generate a new secret for a given user
export const generateTwoFactorSecret = (email: string) => {
  const secret = generateSecret();
  const otpAuthUrl = generateURI({
    label: email,
    issuer: "CityCatalyst",
    secret,
  });

  return { secret, otpAuthUrl };
};

// Generate QR code as data URL
export const generateQRCode = async (otpAuthUrl: string) => {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);
    return qrCodeDataUrl;
  } catch (error) {
    logger.error({ error }, "Failed to generate QR code");
    throw error;
  }
};

// Verify OTP code
export const verifyToken = async (token: string, secret: string) => {
  try {
    const result = await verify({ token, secret });
    return result.valid;
  } catch (error) {
    logger.error({ error }, "Failed to verify 2FA token");
    return false;
  }
};
