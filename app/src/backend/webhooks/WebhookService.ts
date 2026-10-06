import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";

import { db } from "@/models";
import type { WebhookSubscription } from "@/models/WebhookSubscription";
import type { WebhookEnvelope } from "@/models/WebhookDelivery";
import { logger } from "@/services/logger";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  generateWebhookSecret,
} from "@/util/webhook-crypto";
import {
  isEmittedWebhookEventType,
  type WebhookEventType,
} from "@/backend/webhooks/events";

const HTTPS_URL = /^https:\/\/.+/i;
const MAX_NAME_LENGTH = 255;

export type PublicWebhookSubscription = {
  id: string;
  organizationId: string;
  name: string;
  url: string;
  secretPrefix: string;
  events: string[];
  enabled: boolean;
  consecutiveFailures: number;
  disabledAt: Date | null;
  createdBy: string | null;
  created: Date | null;
  lastUpdated: Date | null;
};

function assertHttpsUrl(url: string) {
  if (!HTTPS_URL.test(url)) {
    throw new createHttpError.BadRequest("webhook-url-must-be-https");
  }
}

function assertEvents(events: string[]): asserts events is WebhookEventType[] {
  if (!events.length) {
    throw new createHttpError.BadRequest("webhook-events-required");
  }
  for (const event of events) {
    if (!isEmittedWebhookEventType(event)) {
      throw new createHttpError.BadRequest(`unknown-webhook-event:${event}`);
    }
  }
}

export default class WebhookService {
  static toPublic(sub: WebhookSubscription): PublicWebhookSubscription {
    return {
      id: sub.id,
      organizationId: sub.organizationId,
      name: sub.name,
      url: sub.url,
      secretPrefix: sub.secretPrefix,
      events: sub.events,
      enabled: sub.enabled,
      consecutiveFailures: sub.consecutiveFailures,
      disabledAt: sub.disabledAt ?? null,
      createdBy: sub.createdBy ?? null,
      created: sub.created ?? null,
      lastUpdated: sub.lastUpdated ?? null,
    };
  }

  static async list(organizationId: string): Promise<PublicWebhookSubscription[]> {
    const rows = await db.models.WebhookSubscription.findAll({
      where: { organizationId },
      order: [["created", "DESC"]],
    });
    return rows.map((row) => this.toPublic(row));
  }

  static async get(
    organizationId: string,
    webhookId: string,
  ): Promise<WebhookSubscription> {
    const sub = await db.models.WebhookSubscription.findOne({
      where: { id: webhookId, organizationId },
    });
    if (!sub) {
      throw new createHttpError.NotFound("webhook-not-found");
    }
    return sub;
  }

  static async create(params: {
    organizationId: string;
    name: string;
    url: string;
    events: string[];
    createdBy?: string | null;
  }): Promise<{ subscription: PublicWebhookSubscription; secret: string }> {
    const name = params.name.trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      throw new createHttpError.BadRequest("webhook-name-invalid");
    }
    assertHttpsUrl(params.url);
    assertEvents(params.events);

    const { secret, prefix } = generateWebhookSecret();
    const encrypted = encryptWebhookSecret(secret);
    const row = await db.models.WebhookSubscription.create({
      id: randomUUID(),
      organizationId: params.organizationId,
      name,
      url: params.url,
      events: params.events,
      secretCiphertext: encrypted.ciphertext,
      secretIv: encrypted.iv,
      secretAuthTag: encrypted.authTag,
      secretPrefix: prefix,
      enabled: true,
      createdBy: params.createdBy ?? null,
    });
    return { subscription: this.toPublic(row), secret };
  }

  static async update(
    organizationId: string,
    webhookId: string,
    patch: {
      name?: string;
      url?: string;
      events?: string[];
      enabled?: boolean;
    },
  ): Promise<PublicWebhookSubscription> {
    const sub = await this.get(organizationId, webhookId);
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name || name.length > MAX_NAME_LENGTH) {
        throw new createHttpError.BadRequest("webhook-name-invalid");
      }
      sub.name = name;
    }
    if (patch.url !== undefined) {
      assertHttpsUrl(patch.url);
      sub.url = patch.url;
    }
    if (patch.events !== undefined) {
      assertEvents(patch.events);
      sub.events = patch.events;
    }
    if (patch.enabled !== undefined) {
      sub.enabled = patch.enabled;
      if (patch.enabled) {
        sub.disabledAt = null;
        sub.consecutiveFailures = 0;
      }
    }
    await sub.save();
    return this.toPublic(sub);
  }

  static async remove(organizationId: string, webhookId: string): Promise<void> {
    const sub = await this.get(organizationId, webhookId);
    await sub.destroy();
  }

  static async rotateSecret(
    organizationId: string,
    webhookId: string,
  ): Promise<{ subscription: PublicWebhookSubscription; secret: string }> {
    const sub = await this.get(organizationId, webhookId);
    const { secret, prefix } = generateWebhookSecret();
    const encrypted = encryptWebhookSecret(secret);
    await sub.update({
      secretCiphertext: encrypted.ciphertext,
      secretIv: encrypted.iv,
      secretAuthTag: encrypted.authTag,
      secretPrefix: prefix,
    });
    return { subscription: this.toPublic(sub), secret };
  }

  static decryptSecret(sub: WebhookSubscription): string {
    return decryptWebhookSecret({
      ciphertext: sub.secretCiphertext,
      iv: sub.secretIv,
      authTag: sub.secretAuthTag,
    });
  }

  /**
   * Fan-out matching enabled subscriptions into the delivery outbox.
   * Never throws into the domain request path.
   */
  static async emit(
    organizationId: string,
    type: WebhookEventType,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const subscriptions = await db.models.WebhookSubscription.findAll({
        where: {
          organizationId,
          enabled: true,
        },
      });
      const matching = subscriptions.filter((sub) => sub.events.includes(type));
      if (matching.length === 0) {
        logger.debug(
          { organizationId, type },
          "Webhook emit: no matching subscriptions",
        );
        return;
      }

      const createdAt = new Date().toISOString();
      await db.models.WebhookDelivery.bulkCreate(
        matching.map((sub) => {
          const id = randomUUID();
          const payload: WebhookEnvelope = {
            id,
            type,
            created_at: createdAt,
            data: { ...data, organizationId },
          };
          return {
            id,
            subscriptionId: sub.id,
            eventType: type,
            payload,
            status: "pending" as const,
          };
        }),
      );
      logger.info(
        { organizationId, type, count: matching.length },
        "Webhook emit: queued deliveries",
      );
    } catch (error) {
      logger.error(
        { error, organizationId, type },
        "Webhook emit failed; domain mutation continues",
      );
    }
  }

  static async resolveOrganizationIdForCity(
    cityId: string | null | undefined,
  ): Promise<string | null> {
    if (!cityId) return null;
    const city = await db.models.City.findByPk(cityId, {
      include: [
        {
          model: db.models.Project,
          as: "project",
          attributes: ["organizationId"],
        },
      ],
    });
    const organizationId = city?.project?.organizationId;
    if (!organizationId) {
      logger.warn({ cityId }, "Webhook emit: could not resolve organization");
      return null;
    }
    return organizationId;
  }

  static async emitForCity(
    cityId: string | null | undefined,
    type: WebhookEventType,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const organizationId = await this.resolveOrganizationIdForCity(cityId);
      if (!organizationId) return;
      await this.emit(organizationId, type, data);
    } catch (error) {
      logger.error(
        { error, cityId, type },
        "Webhook emitForCity failed; domain mutation continues",
      );
    }
  }
}
