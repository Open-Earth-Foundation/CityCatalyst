import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it, beforeEach } from "@jest/globals";

import {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_EMITTED_EVENT_TYPES,
  isEmittedWebhookEventType,
  isWebhookEventType,
} from "@/backend/webhooks/events";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  generateWebhookSecret,
} from "@/util/webhook-crypto";
import {
  buildWebhookHeaders,
  signWebhookPayload,
  verifyWebhookSignature,
} from "@/util/webhook-signature";

const TEST_KEY = randomBytes(32).toString("base64");

describe("webhook event catalog", () => {
  it("accepts emitted and reserved types and rejects unknown names", () => {
    expect(WEBHOOK_EMITTED_EVENT_TYPES).toEqual([
      "inventory.published",
      "plan.generated",
      "datasource.connected",
    ]);
    expect(isEmittedWebhookEventType("inventory.published")).toBe(true);
    expect(isWebhookEventType("city.created")).toBe(true);
    expect(isEmittedWebhookEventType("city.created")).toBe(false);
    expect(isWebhookEventType("inventory.created")).toBe(false);
    expect(WEBHOOK_EVENT_TYPES).toHaveLength(8);
  });
});

describe("webhook secret crypto", () => {
  beforeEach(() => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_KEY;
  });

  it("round-trips a generated signing secret", () => {
    const { secret, prefix } = generateWebhookSecret();
    expect(prefix).toHaveLength(6);
    expect(secret.startsWith(prefix)).toBe(true);
    const encrypted = encryptWebhookSecret(secret);
    expect(decryptWebhookSecret(encrypted)).toBe(secret);
  });

  it("rejects a truncated encryption key", () => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encryptWebhookSecret("secret")).toThrow(
      /must be 32 bytes/,
    );
  });
});

describe("webhook HMAC signature", () => {
  const secret = "test-signing-secret";
  const rawBody = JSON.stringify({
    id: "550e8400-e29b-41d4-a716-446655440000",
    type: "inventory.published",
    created_at: "2026-08-10T08:00:00.000Z",
    data: { inventoryId: "inv-1" },
  });
  const timestampSeconds = 1754812800;

  it("signs timestamp.rawBody as sha256 hex", () => {
    const expected =
      "sha256=" +
      createHmac("sha256", secret)
        .update(`${timestampSeconds}.${rawBody}`, "utf8")
        .digest("hex");
    expect(signWebhookPayload(secret, timestampSeconds, rawBody)).toBe(expected);
    expect(
      verifyWebhookSignature({
        secret,
        timestampSeconds,
        rawBody,
        signatureHeader: expected,
      }),
    ).toBe(true);
  });

  it("rejects a tampered body or signature", () => {
    const signature = signWebhookPayload(secret, timestampSeconds, rawBody);
    expect(
      verifyWebhookSignature({
        secret,
        timestampSeconds,
        rawBody: rawBody.replace("inv-1", "inv-2"),
        signatureHeader: signature,
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        secret,
        timestampSeconds,
        rawBody,
        signatureHeader: signature.slice(0, -1) + "0",
      }),
    ).toBe(false);
  });

  it("builds the partner-facing CityCatalyst headers", () => {
    const signature = signWebhookPayload(secret, timestampSeconds, rawBody);
    expect(
      buildWebhookHeaders({
        eventType: "inventory.published",
        deliveryId: "delivery-1",
        timestampSeconds,
        signature,
      }),
    ).toEqual({
      "X-CityCatalyst-Event": "inventory.published",
      "X-CityCatalyst-Delivery": "delivery-1",
      "X-CityCatalyst-Timestamp": String(timestampSeconds),
      "X-CityCatalyst-Signature": signature,
    });
  });
});
