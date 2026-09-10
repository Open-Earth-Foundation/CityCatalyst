import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const AES_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SECRET_BYTES = 32;

export type EncryptedWebhookSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

function getEncryptionKey(): Buffer {
  const encoded = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("WEBHOOK_SECRET_ENCRYPTION_KEY is not configured");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error(
      "WEBHOOK_SECRET_ENCRYPTION_KEY must be 32 bytes encoded as base64",
    );
  }
  return key;
}

/** Generate a 32-byte signing secret and a short prefix for support/debug. */
export function generateWebhookSecret(): { secret: string; prefix: string } {
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  return { secret, prefix: secret.slice(0, 6) };
}

export function encryptWebhookSecret(plaintext: string): EncryptedWebhookSecret {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptWebhookSecret(
  encrypted: EncryptedWebhookSecret,
): string {
  const decipher = createDecipheriv(
    AES_ALGORITHM,
    getEncryptionKey(),
    Buffer.from(encrypted.iv, "base64"),
    { authTagLength: AUTH_TAG_LENGTH },
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
