import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export const NATIVE_INPUT_CATALOG_KINDS = [
  "inventory_import",
  "inventory_source_file",
  "inventory_ocr",
  "hiap_ranking",
  "hiap_selection",
  "hiap_action_plan",
  "cnb_upload",
  "hiap_meed_artifact",
  "hiap_meed_ranking",
] as const;

export const NATIVE_INPUT_CATALOG_OWNING_MODULES = [
  "ghgi",
  "hiap",
  "hiap_meed",
  "cnb",
] as const;

export const NATIVE_INPUT_CATALOG_SOURCE_TYPES = [
  "inventory",
  "imported_inventory_file",
  "pdf_ocr_job",
  "hiap_ranking",
  "hiap_ranked_selection",
  "hiap_unranked_selection",
  "action_plan",
  "cnb_upload",
  "hiap_meed_artifact",
  "hiap_meed_ranking",
] as const;

export const NATIVE_INPUT_CATALOG_AVAILABILITIES = [
  "active",
  "withdrawn",
  "superseded",
] as const;

export type NativeInputCatalogAvailability =
  (typeof NATIVE_INPUT_CATALOG_AVAILABILITIES)[number];

export interface NativeInputCatalogAttributes {
  id: string;
  kind: string;
  owningModule: string;
  sourceType: string;
  sourceId: string;
  userId?: string | null;
  inventoryId?: string | null;
  cityId?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
  availability: NativeInputCatalogAvailability;
  supersededById?: string | null;
  contentDigest?: string | null;
  markdownReady?: boolean | null;
  labels?: Record<string, unknown> | null;
  created?: Date;
  lastUpdated?: Date;
}

export type NativeInputCatalogCreationAttributes = Optional<
  NativeInputCatalogAttributes,
  | "id"
  | "userId"
  | "inventoryId"
  | "cityId"
  | "projectId"
  | "organizationId"
  | "availability"
  | "supersededById"
  | "contentDigest"
  | "markdownReady"
  | "labels"
  | "created"
  | "lastUpdated"
>;

export class NativeInputCatalog
  extends Model<
    NativeInputCatalogAttributes,
    NativeInputCatalogCreationAttributes
  >
  implements NativeInputCatalogAttributes
{
  declare id: string;
  declare kind: string;
  declare owningModule: string;
  declare sourceType: string;
  declare sourceId: string;
  declare userId?: string | null;
  declare inventoryId?: string | null;
  declare cityId?: string | null;
  declare projectId?: string | null;
  declare organizationId?: string | null;
  declare availability: NativeInputCatalogAvailability;
  declare supersededById?: string | null;
  declare contentDigest?: string | null;
  declare markdownReady?: boolean | null;
  declare labels?: Record<string, unknown> | null;
  declare created?: Date;
  declare lastUpdated?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof NativeInputCatalog {
    return NativeInputCatalog.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        kind: {
          type: DataTypes.STRING(64),
          allowNull: false,
        },
        owningModule: {
          type: DataTypes.STRING(64),
          allowNull: false,
          field: "owning_module",
        },
        sourceType: {
          type: DataTypes.STRING(64),
          allowNull: false,
          field: "source_type",
        },
        sourceId: {
          type: DataTypes.STRING(255),
          allowNull: false,
          field: "source_id",
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "user_id",
        },
        inventoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "inventory_id",
        },
        cityId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "city_id",
        },
        projectId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "project_id",
        },
        organizationId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "organization_id",
        },
        availability: {
          type: DataTypes.STRING(32),
          allowNull: false,
          defaultValue: "active",
        },
        supersededById: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "superseded_by_id",
        },
        contentDigest: {
          type: DataTypes.STRING(128),
          allowNull: true,
          field: "content_digest",
        },
        markdownReady: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          field: "markdown_ready",
        },
        labels: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
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
        tableName: "NativeInputCatalog",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "idx_native_input_catalog_availability",
            fields: [{ name: "availability" }],
          },
          {
            name: "idx_native_input_catalog_user_availability",
            fields: [{ name: "user_id" }, { name: "availability" }],
          },
          {
            name: "idx_native_input_catalog_inventory_availability",
            fields: [{ name: "inventory_id" }, { name: "availability" }],
          },
          {
            name: "idx_native_input_catalog_city_availability",
            fields: [{ name: "city_id" }, { name: "availability" }],
          },
          {
            name: "idx_native_input_catalog_project_availability",
            fields: [{ name: "project_id" }, { name: "availability" }],
          },
          {
            name: "idx_native_input_catalog_organization_availability",
            fields: [{ name: "organization_id" }, { name: "availability" }],
          },
        ],
      },
    );
  }
}
