import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_SIGNATURE_PREFIX = "sha256=";

export type WebhookSignatureHeaders = {
  "X-CityCatalyst-Event": string;
  "X-CityCatalyst-Delivery": string;
  "X-CityCatalyst-Timestamp": string;
  "X-CityCatalyst-Signature": string;
};

/** HMAC-SHA256 over `${timestamp}.${rawBody}` as specified in WebhooksArchitecture.md. */
export function signWebhookPayload(
  secret: string,
  timestampSeconds: number,
  rawBody: string,
): string {
  const signedPayload = `${timestampSeconds}.${rawBody}`;
  const digest = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");
  return `${WEBHOOK_SIGNATURE_PREFIX}${digest}`;
}

export function buildWebhookHeaders(params: {
  eventType: string;
  deliveryId: string;
  timestampSeconds: number;
  signature: string;
}): WebhookSignatureHeaders {
  return {
    "X-CityCatalyst-Event": params.eventType,
    "X-CityCatalyst-Delivery": params.deliveryId,
    "X-CityCatalyst-Timestamp": String(params.timestampSeconds),
    "X-CityCatalyst-Signature": params.signature,
  };
}

export function verifyWebhookSignature(params: {
  secret: string;
  timestampSeconds: number;
  rawBody: string;
  signatureHeader: string;
}): boolean {
  const expected = signWebhookPayload(
    params.secret,
    params.timestampSeconds,
    params.rawBody,
  );
  const provided = params.signatureHeader;
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
