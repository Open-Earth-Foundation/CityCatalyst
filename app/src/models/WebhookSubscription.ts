import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { Organization, OrganizationId } from "./Organization";
import type { User, UserId } from "./User";
import type { WebhookDelivery } from "./WebhookDelivery";

export interface WebhookSubscriptionAttributes {
  id: string;
  organizationId: string;
  name: string;
  url: string;
  secretCiphertext: string;
  secretIv: string;
  secretAuthTag: string;
  secretPrefix: string;
  events: string[];
  enabled: boolean;
  consecutiveFailures: number;
  disabledAt?: Date | null;
  createdBy?: string | null;
  created?: Date;
  lastUpdated?: Date;
}

export type WebhookSubscriptionCreationAttributes = Optional<
  WebhookSubscriptionAttributes,
  | "id"
  | "enabled"
  | "consecutiveFailures"
  | "disabledAt"
  | "createdBy"
  | "created"
  | "lastUpdated"
>;

export class WebhookSubscription
  extends Model<
    WebhookSubscriptionAttributes,
    WebhookSubscriptionCreationAttributes
  >
  implements WebhookSubscriptionAttributes
{
  declare id: string;
  declare organizationId: string;
  declare name: string;
  declare url: string;
  declare secretCiphertext: string;
  declare secretIv: string;
  declare secretAuthTag: string;
  declare secretPrefix: string;
  declare events: string[];
  declare enabled: boolean;
  declare consecutiveFailures: number;
  declare disabledAt?: Date | null;
  declare createdBy?: string | null;
  declare created?: Date;
  declare lastUpdated?: Date;

  declare organization?: Organization;
  declare getOrganization: Sequelize.BelongsToGetAssociationMixin<Organization>;
  declare setOrganization: Sequelize.BelongsToSetAssociationMixin<
    Organization,
    OrganizationId
  >;

  declare creator?: User;
  declare getCreator: Sequelize.BelongsToGetAssociationMixin<User>;
  declare setCreator: Sequelize.BelongsToSetAssociationMixin<User, UserId>;

  declare deliveries?: WebhookDelivery[];

  static initModel(
    sequelize: Sequelize.Sequelize,
  ): typeof WebhookSubscription {
    return WebhookSubscription.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        organizationId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "organization_id",
          references: {
            model: "Organization",
            key: "organization_id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        name: { type: DataTypes.STRING(255), allowNull: false },
        url: { type: DataTypes.STRING(2048), allowNull: false },
        secretCiphertext: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "secret_ciphertext",
        },
        secretIv: {
          type: DataTypes.STRING(64),
          allowNull: false,
          field: "secret_iv",
        },
        secretAuthTag: {
          type: DataTypes.STRING(64),
          allowNull: false,
          field: "secret_auth_tag",
        },
        secretPrefix: {
          type: DataTypes.STRING(8),
          allowNull: false,
          field: "secret_prefix",
        },
        events: { type: DataTypes.JSONB, allowNull: false },
        enabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        consecutiveFailures: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "consecutive_failures",
        },
        disabledAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "disabled_at",
        },
        createdBy: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "created_by",
          references: { model: "User", key: "user_id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
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
        tableName: "WebhookSubscription",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "idx_webhook_subscription_organization",
            fields: [{ name: "organization_id" }],
          },
        ],
      },
    );
  }
}
