import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { WebhookSubscription } from "./WebhookSubscription";

export const WEBHOOK_DELIVERY_STATUSES = [
  "pending",
  "delivering",
  "delivered",
  "failed",
] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export type WebhookEnvelope = {
  id: string;
  type: string;
  created_at: string;
  data: Record<string, unknown>;
};

export interface WebhookDeliveryAttributes {
  id: string;
  subscriptionId: string;
  eventType: string;
  payload: WebhookEnvelope;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  runAfter?: Date | null;
  deliveredAt?: Date | null;
  lastHttpStatus?: number | null;
  lastError?: string | null;
  created?: Date;
  lastUpdated?: Date;
}

export type WebhookDeliveryCreationAttributes = Optional<
  WebhookDeliveryAttributes,
  | "id"
  | "status"
  | "attemptCount"
  | "runAfter"
  | "deliveredAt"
  | "lastHttpStatus"
  | "lastError"
  | "created"
  | "lastUpdated"
>;

export class WebhookDelivery
  extends Model<WebhookDeliveryAttributes, WebhookDeliveryCreationAttributes>
  implements WebhookDeliveryAttributes
{
  declare id: string;
  declare subscriptionId: string;
  declare eventType: string;
  declare payload: WebhookEnvelope;
  declare status: WebhookDeliveryStatus;
  declare attemptCount: number;
  declare runAfter?: Date | null;
  declare deliveredAt?: Date | null;
  declare lastHttpStatus?: number | null;
  declare lastError?: string | null;
  declare created?: Date;
  declare lastUpdated?: Date;

  declare subscription?: WebhookSubscription;

  static initModel(sequelize: Sequelize.Sequelize): typeof WebhookDelivery {
    return WebhookDelivery.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        subscriptionId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "subscription_id",
          references: { model: "WebhookSubscription", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        eventType: {
          type: DataTypes.STRING(128),
          allowNull: false,
          field: "event_type",
        },
        payload: { type: DataTypes.JSONB, allowNull: false },
        status: {
          type: DataTypes.STRING(32),
          allowNull: false,
          defaultValue: "pending",
          validate: { isIn: [WEBHOOK_DELIVERY_STATUSES] },
        },
        attemptCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "attempt_count",
        },
        runAfter: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "run_after",
        },
        deliveredAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "delivered_at",
        },
        lastHttpStatus: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "last_http_status",
        },
        lastError: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "last_error",
        },
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "created",
        },
        lastUpdated: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "last_updated",
        },
      },
      {
        sequelize,
        tableName: "WebhookDelivery",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "idx_webhook_delivery_due",
            fields: [{ name: "status" }, { name: "run_after" }],
          },
          {
            name: "idx_webhook_delivery_subscription",
            fields: [{ name: "subscription_id" }],
          },
        ],
      },
    );
  }
}
