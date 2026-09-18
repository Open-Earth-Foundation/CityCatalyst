import type { User } from "@/models/User";
import { logger } from "@/services/logger";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import crypto from "node:crypto";

export const recoveryTokenLength = 10;

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

// Generate recovery codes used as a backup in case the authenticator device is lost
export const generateRecoveryCodes = async () => {
  const codeCount = 10;
  const recoveryCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < codeCount; i++) {
    const rawCode = crypto.randomBytes(5).toString("hex");
    // if this is adjusted, also adjust the recoveryTokenMinLength constant above to match the total length
    const code = `${rawCode.slice(0, 5)}-${rawCode.slice(5)}`;
    recoveryCodes.push(code);

    const hash = crypto.createHash("sha256").update(code).digest("hex");
    hashedCodes.push(hash);
  }

  return { recoveryCodes, hashedCodes };
};

// Check hash of recovery code against remaining hashes in user record and remove if successful
export const verifyRecoveryCode = async (user: User, recoveryCode: string) => {
  // re-add middle dash in case it was not entered by user to make the hash still match
  if (!recoveryCode.includes("-") && recoveryCode.length === 10) {
    recoveryCode = `${recoveryCode.slice(0, 5)}-${recoveryCode.slice(5)}`;
  }
  const hash = crypto.createHash("sha256").update(recoveryCode).digest("hex");
  const userHashes = user.twoFactorRecoveryHashes ?? [];
  const codeIndex = userHashes.indexOf(hash);

  if (codeIndex !== -1) {
    // delete recovery code from user record so it can only be used one time
    userHashes.splice(codeIndex, 1);
    user.twoFactorRecoveryHashes = userHashes;
    // force sequelize to update the column
    user.changed("twoFactorRecoveryHashes", true);
    await user.save();
    return true;
  }

  return false;
};
