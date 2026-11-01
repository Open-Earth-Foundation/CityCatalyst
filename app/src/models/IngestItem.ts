import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { City } from "./City";
import type { Inventory } from "./Inventory";
import type { IngestJob, IngestJobId } from "./IngestJob";
import type { User } from "./User";
import {
  INGEST_ITEM_STATUSES,
  INGEST_STAGES,
  type IngestItemStatus,
  type IngestStage,
} from "@/backend/ingest/types";

export interface IngestItemAttributes {
  id: string;
  jobId: string;
  originalFileName: string;
  contentHash?: string | null;
  s3Key?: string | null;
  status: IngestItemStatus;
  stage?: IngestStage | null;
  errorCode?: string | null;
  errorLog?: string | null;
  warnings?: string[] | null;
  targetCityId?: string | null;
  targetInventoryId?: string | null;
  coverageYears?: number[] | null;
  result?: Record<string, unknown> | null;
  reviewDraft?: Record<string, unknown> | null;
  reviewLockedByUserId?: string | null;
  reviewLockedAt?: Date | null;
  data?: Buffer | Uint8Array | null;
  created?: Date;
  lastUpdated?: Date;
}

export type IngestItemPk = "id";
export type IngestItemId = IngestItem[IngestItemPk];
export type IngestItemOptionalAttributes =
  | "id"
  | "contentHash"
  | "s3Key"
  | "status"
  | "stage"
  | "errorCode"
  | "errorLog"
  | "warnings"
  | "targetCityId"
  | "targetInventoryId"
  | "coverageYears"
  | "result"
  | "reviewDraft"
  | "reviewLockedByUserId"
  | "reviewLockedAt"
  | "data"
  | "created"
  | "lastUpdated";
export type IngestItemCreationAttributes = Optional<
  IngestItemAttributes,
  IngestItemOptionalAttributes
>;

export class IngestItem
  extends Model<IngestItemAttributes, IngestItemCreationAttributes>
  implements IngestItemAttributes
{
  declare id: string;
  declare jobId: string;
  declare originalFileName: string;
  declare contentHash?: string | null;
  declare s3Key?: string | null;
  declare status: IngestItemStatus;
  declare stage?: IngestStage | null;
  declare errorCode?: string | null;
  declare errorLog?: string | null;
  declare warnings?: string[] | null;
  declare targetCityId?: string | null;
  declare targetInventoryId?: string | null;
  declare coverageYears?: number[] | null;
  declare result?: Record<string, unknown> | null;
  declare reviewDraft?: Record<string, unknown> | null;
  declare reviewLockedByUserId?: string | null;
  declare reviewLockedAt?: Date | null;
  declare data?: Buffer | Uint8Array | null;
  declare created?: Date;
  declare lastUpdated?: Date;

  declare job?: IngestJob;
  declare getJob: Sequelize.BelongsToGetAssociationMixin<IngestJob>;
  declare setJob: Sequelize.BelongsToSetAssociationMixin<IngestJob, IngestJobId>;
  declare city?: City | null;
  declare inventory?: Inventory | null;
  declare reviewLockedBy?: User | null;

  static initModel(sequelize: Sequelize.Sequelize): typeof IngestItem {
    return IngestItem.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        jobId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "job_id",
          references: { model: "IngestJob", key: "id" },
        },
        originalFileName: {
          type: DataTypes.STRING(512),
          allowNull: false,
          field: "original_file_name",
        },
        contentHash: {
          type: DataTypes.STRING(64),
          allowNull: true,
          field: "content_hash",
        },
        s3Key: {
          type: DataTypes.STRING(1024),
          allowNull: true,
          field: "s3_key",
        },
        status: {
          type: DataTypes.STRING(32),
          allowNull: false,
          defaultValue: "pending",
          validate: { isIn: [INGEST_ITEM_STATUSES] },
        },
        stage: {
          type: DataTypes.STRING(32),
          allowNull: true,
          validate: { isIn: [INGEST_STAGES] },
        },
        errorCode: {
          type: DataTypes.STRING(64),
          allowNull: true,
          field: "error_code",
        },
        errorLog: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "error_log",
        },
        warnings: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        targetCityId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "target_city_id",
          references: { model: "City", key: "city_id" },
        },
        targetInventoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "target_inventory_id",
          references: { model: "Inventory", key: "inventory_id" },
        },
        coverageYears: {
          type: DataTypes.JSONB,
          allowNull: true,
          field: "coverage_years",
        },
        result: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        reviewDraft: {
          type: DataTypes.JSONB,
          allowNull: true,
          field: "review_draft",
        },
        reviewLockedByUserId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "review_locked_by_user_id",
          references: { model: "User", key: "user_id" },
        },
        reviewLockedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "review_locked_at",
        },
        data: {
          type: DataTypes.BLOB,
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
        tableName: "IngestItem",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        underscored: true,
        indexes: [
          {
            name: "idx_ingest_item_job_status",
            fields: [{ name: "job_id" }, { name: "status" }],
          },
        ],
      },
    );
  }
}
