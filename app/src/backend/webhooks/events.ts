/**
 * Webhook event catalog (CC-669).
 * v1 emits three types; reserved types are documented for partners but not emitted yet.
 */

export const WEBHOOK_EMITTED_EVENT_TYPES = [
  "inventory.published",
  "plan.generated",
  "datasource.connected",
] as const;

export const WEBHOOK_RESERVED_EVENT_TYPES = [
  "inventory.unpublished",
  "inventory.deleted",
  "datasource.disconnected",
  "city.created",
  "organization.updated",
] as const;

export const WEBHOOK_EVENT_TYPES = [
  ...WEBHOOK_EMITTED_EVENT_TYPES,
  ...WEBHOOK_RESERVED_EVENT_TYPES,
] as const;

export type WebhookEmittedEventType = (typeof WEBHOOK_EMITTED_EVENT_TYPES)[number];
export type WebhookReservedEventType =
  (typeof WEBHOOK_RESERVED_EVENT_TYPES)[number];
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export function isWebhookEventType(value: string): value is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

export function isEmittedWebhookEventType(
  value: string,
): value is WebhookEmittedEventType {
  return (WEBHOOK_EMITTED_EVENT_TYPES as readonly string[]).includes(value);
}
