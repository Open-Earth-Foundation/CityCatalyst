import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export const PDF_OCR_SOURCE_TYPES = [
  "inventory_import",
  "concept_note_upload",
] as const;
export type PdfOcrSourceType = (typeof PDF_OCR_SOURCE_TYPES)[number];

export const PDF_OCR_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export type PdfOcrStatus = (typeof PDF_OCR_STATUSES)[number];

export const PDF_OCR_DELIVERY_STATUSES = [
  "pending",
  "delivering",
  "delivered",
  "failed",
] as const;
export type PdfOcrDeliveryStatus = (typeof PDF_OCR_DELIVERY_STATUSES)[number];

export interface PdfOcrJobAttributes {
  sourceType: PdfOcrSourceType;
  sourceId: string;
  status: PdfOcrStatus;
  attemptCount: number;
  runAfter?: Date | null;
  model?: string | null;
  pageCount?: number | null;
  resultS3Key?: string | null;
  resultSizeBytes?: number | null;
  resultSha256?: string | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
  heartbeatAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  deliveryTarget?: "climate_advisor" | null;
  deliveryStatus?: PdfOcrDeliveryStatus | null;
  deliveryAttemptCount: number;
  deliveryRunAfter?: Date | null;
  deliveredAt?: Date | null;
  deliveryErrorCode?: string | null;
  deliveryErrorMessage?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PdfOcrJobCreationAttributes = Optional<
  PdfOcrJobAttributes,
  | "status"
  | "attemptCount"
  | "runAfter"
  | "model"
  | "pageCount"
  | "resultS3Key"
  | "resultSizeBytes"
  | "resultSha256"
  | "leaseOwner"
  | "leaseExpiresAt"
  | "heartbeatAt"
  | "startedAt"
  | "completedAt"
  | "errorCode"
  | "errorMessage"
  | "deliveryTarget"
  | "deliveryStatus"
  | "deliveryAttemptCount"
  | "deliveryRunAfter"
  | "deliveredAt"
  | "deliveryErrorCode"
  | "deliveryErrorMessage"
  | "createdAt"
  | "updatedAt"
>;

export class PdfOcrJob
  extends Model<PdfOcrJobAttributes, PdfOcrJobCreationAttributes>
  implements PdfOcrJobAttributes
{
  declare sourceType: PdfOcrSourceType;
  declare sourceId: string;
  declare status: PdfOcrStatus;
  declare attemptCount: number;
  declare runAfter?: Date | null;
  declare model?: string | null;
  declare pageCount?: number | null;
  declare resultS3Key?: string | null;
  declare resultSizeBytes?: number | null;
  declare resultSha256?: string | null;
  declare leaseOwner?: string | null;
  declare leaseExpiresAt?: Date | null;
  declare heartbeatAt?: Date | null;
  declare startedAt?: Date | null;
  declare completedAt?: Date | null;
  declare errorCode?: string | null;
  declare errorMessage?: string | null;
  declare deliveryTarget?: "climate_advisor" | null;
  declare deliveryStatus?: PdfOcrDeliveryStatus | null;
  declare deliveryAttemptCount: number;
  declare deliveryRunAfter?: Date | null;
  declare deliveredAt?: Date | null;
  declare deliveryErrorCode?: string | null;
  declare deliveryErrorMessage?: string | null;
  declare createdAt?: Date;
  declare updatedAt?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof PdfOcrJob {
    return PdfOcrJob.init(
      {
        sourceType: {
          type: DataTypes.STRING(64),
          allowNull: false,
          primaryKey: true,
          field: "source_type",
          validate: { isIn: [PDF_OCR_SOURCE_TYPES] },
        },
        sourceId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "source_id",
        },
        status: {
          type: DataTypes.STRING(32),
          allowNull: false,
          defaultValue: "queued",
          validate: { isIn: [PDF_OCR_STATUSES] },
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
        model: { type: DataTypes.STRING(128), allowNull: true },
        pageCount: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "page_count",
        },
        resultS3Key: {
          type: DataTypes.STRING(1024),
          allowNull: true,
          field: "result_s3_key",
        },
        resultSizeBytes: {
          type: DataTypes.BIGINT,
          allowNull: true,
          field: "result_size_bytes",
        },
        resultSha256: {
          type: DataTypes.STRING(64),
          allowNull: true,
          field: "result_sha256",
        },
        leaseOwner: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "lease_owner",
        },
        leaseExpiresAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "lease_expires_at",
        },
        heartbeatAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "heartbeat_at",
        },
        startedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "started_at",
        },
        completedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "completed_at",
        },
        errorCode: {
          type: DataTypes.STRING(128),
          allowNull: true,
          field: "error_code",
        },
        errorMessage: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "error_message",
        },
        deliveryTarget: {
          type: DataTypes.STRING(64),
          allowNull: true,
          field: "delivery_target",
          validate: { isIn: [["climate_advisor"]] },
        },
        deliveryStatus: {
          type: DataTypes.STRING(32),
          allowNull: true,
          field: "delivery_status",
          validate: { isIn: [PDF_OCR_DELIVERY_STATUSES] },
        },
        deliveryAttemptCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "delivery_attempt_count",
        },
        deliveryRunAfter: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "delivery_run_after",
        },
        deliveredAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "delivered_at",
        },
        deliveryErrorCode: {
          type: DataTypes.STRING(128),
          allowNull: true,
          field: "delivery_error_code",
        },
        deliveryErrorMessage: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "delivery_error_message",
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "created_at",
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "updated_at",
        },
      },
      {
        sequelize,
        tableName: "PdfOcrJob",
        schema: "public",
        timestamps: true,
        createdAt: "createdAt",
        updatedAt: "updatedAt",
      },
    );
  }
}
