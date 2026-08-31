import { Op } from "sequelize";

import { db } from "@/models";
import type { WebhookDelivery } from "@/models/WebhookDelivery";
import type { WebhookSubscription } from "@/models/WebhookSubscription";
import { logger } from "@/services/logger";
import WebhookService from "@/backend/webhooks/WebhookService";
import {
  buildWebhookHeaders,
  signWebhookPayload,
} from "@/util/webhook-signature";

const MAX_ATTEMPTS = 8;
const AUTO_DISABLE_FAILURES = 10;
const DELIVERY_TIMEOUT_MS = 15_000;
const BATCH_SIZE = 10;
/** Purge terminal deliveries older than this to keep the outbox table bounded. */
const DELIVERY_RETENTION_DAYS = 30;
const MAX_LOG_BODY_CHARS = 500;

function backoffMs(attempt: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 900_000);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function truncateForLog(value: string): string {
  return value.slice(0, MAX_LOG_BODY_CHARS);
}

export type ProcessWebhookDeliveriesResult = {
  claimed: number;
  delivered: number;
  retried: number;
  failed: number;
  purged: number;
};

async function purgeOldDeliveries(): Promise<number> {
  const cutoff = new Date(
    Date.now() - DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  return db.models.WebhookDelivery.destroy({
    where: {
      status: { [Op.in]: ["delivered", "failed"] },
      created: { [Op.lt]: cutoff },
    },
  });
}

async function markSuccess(
  delivery: WebhookDelivery,
  subscription: WebhookSubscription,
  httpStatus: number,
): Promise<void> {
  await delivery.update({
    status: "delivered",
    attemptCount: delivery.attemptCount + 1,
    runAfter: null,
    deliveredAt: new Date(),
    lastHttpStatus: httpStatus,
    lastError: null,
  });
  if (subscription.consecutiveFailures !== 0) {
    await subscription.update({
      consecutiveFailures: 0,
      disabledAt: null,
    });
  }
}

async function markAttemptFailure(params: {
  delivery: WebhookDelivery;
  subscription: WebhookSubscription;
  retryable: boolean;
  httpStatus?: number | null;
  error: string;
  responseBody?: string;
}): Promise<"retried" | "failed"> {
  const attempt = params.delivery.attemptCount + 1;
  const exhausted = !params.retryable || attempt >= MAX_ATTEMPTS;
  const consecutiveFailures = params.subscription.consecutiveFailures + 1;
  const shouldDisable = consecutiveFailures >= AUTO_DISABLE_FAILURES;

  await params.delivery.update({
    status: exhausted ? "failed" : "pending",
    attemptCount: attempt,
    runAfter: exhausted ? null : new Date(Date.now() + backoffMs(attempt)),
    lastHttpStatus: params.httpStatus ?? null,
    lastError: params.error.slice(0, 500),
  });

  await params.subscription.update({
    consecutiveFailures,
    enabled: shouldDisable ? false : params.subscription.enabled,
    disabledAt: shouldDisable ? new Date() : params.subscription.disabledAt,
  });

  if (shouldDisable) {
    logger.warn(
      {
        subscriptionId: params.subscription.id,
        url: params.subscription.url,
        consecutiveFailures,
        httpStatus: params.httpStatus ?? null,
        error: params.error,
        responseBody: params.responseBody
          ? truncateForLog(params.responseBody)
          : undefined,
      },
      "Webhook subscription auto-disabled after consecutive failures",
    );
  }

  return exhausted ? "failed" : "retried";
}

async function postDelivery(
  delivery: WebhookDelivery,
  subscription: WebhookSubscription,
): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  responseBody?: string;
  retryable: boolean;
}> {
  let secret: string;
  try {
    secret = WebhookService.decryptSecret(subscription);
  } catch (error) {
    return {
      ok: false,
      retryable: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to decrypt webhook secret",
    };
  }

  const rawBody = JSON.stringify(delivery.payload);
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(secret, timestampSeconds, rawBody);
  const headers = buildWebhookHeaders({
    eventType: delivery.eventType,
    deliveryId: delivery.id,
    timestampSeconds,
    signature,
  });

  try {
    const response = await fetch(subscription.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: rawBody,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    if (response.ok) {
      return { ok: true, status: response.status, retryable: false };
    }
    const responseBody = await response.text().catch(() => "");
    return {
      ok: false,
      status: response.status,
      retryable: isRetryableStatus(response.status),
      error: `HTTP ${response.status}`,
      responseBody,
    };
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function processWebhookDeliveries(): Promise<ProcessWebhookDeliveriesResult> {
  const result: ProcessWebhookDeliveriesResult = {
    claimed: 0,
    delivered: 0,
    retried: 0,
    failed: 0,
    purged: 0,
  };

  result.purged = await purgeOldDeliveries();

  const due = await db.models.WebhookDelivery.findAll({
    where: {
      status: { [Op.in]: ["pending", "delivering"] },
      [Op.or]: [{ runAfter: null }, { runAfter: { [Op.lte]: new Date() } }],
    },
    include: [{ model: db.models.WebhookSubscription, as: "subscription" }],
    order: [["runAfter", "ASC"]],
    limit: BATCH_SIZE,
  });

  for (const delivery of due) {
    const subscription = delivery.subscription;
    if (!subscription) {
      await delivery.update({
        status: "failed",
        lastError: "Subscription missing",
      });
      result.failed += 1;
      result.claimed += 1;
      continue;
    }
    if (!subscription.enabled) {
      await delivery.update({
        status: "failed",
        lastError: "Subscription disabled",
      });
      result.failed += 1;
      result.claimed += 1;
      continue;
    }

    result.claimed += 1;
    await delivery.update({ status: "delivering" });
    const outcome = await postDelivery(delivery, subscription);
    if (outcome.ok) {
      await markSuccess(delivery, subscription, outcome.status ?? 200);
      result.delivered += 1;
      logger.info(
        { deliveryId: delivery.id, subscriptionId: subscription.id },
        "Webhook delivery succeeded",
      );
      continue;
    }

    const next = await markAttemptFailure({
      delivery,
      subscription,
      retryable: outcome.retryable,
      httpStatus: outcome.status,
      error: outcome.error ?? "Delivery failed",
      responseBody: outcome.responseBody,
    });
    if (next === "failed") {
      result.failed += 1;
      logger.warn(
        {
          deliveryId: delivery.id,
          subscriptionId: subscription.id,
          url: subscription.url,
          httpStatus: outcome.status ?? null,
          error: outcome.error,
          responseBody: outcome.responseBody
            ? truncateForLog(outcome.responseBody)
            : undefined,
        },
        "Webhook delivery marked failed",
      );
    } else {
      result.retried += 1;
    }
  }

  return result;
}
