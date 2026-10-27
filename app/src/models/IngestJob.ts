import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { City } from "./City";
import type { Organization } from "./Organization";
import type { Project } from "./Project";
import type { User } from "./User";
import type { IngestItem, IngestItemId } from "./IngestItem";
import {
  INGEST_JOB_STATUSES,
  INGEST_MODULES,
  INGEST_VISIBILITIES,
  type IngestJobStatus,
  type IngestModuleId,
  type IngestVisibility,
} from "@/backend/ingest/types";

export interface IngestJobAttributes {
  id: string;
  moduleId: IngestModuleId;
  status: IngestJobStatus;
  dryRun: boolean;
  visibility: IngestVisibility;
  organizationId?: string | null;
  projectId?: string | null;
  cityId?: string | null;
  uploadedByUserId?: string | null;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  awaitingReviewCount: number;
  errorCode?: string | null;
  errorLog?: string | null;
  created?: Date;
  lastUpdated?: Date;
}

export type IngestJobPk = "id";
export type IngestJobId = IngestJob[IngestJobPk];
export type IngestJobOptionalAttributes =
  | "id"
  | "status"
  | "dryRun"
  | "visibility"
  | "organizationId"
  | "projectId"
  | "cityId"
  | "uploadedByUserId"
  | "totalCount"
  | "completedCount"
  | "failedCount"
  | "skippedCount"
  | "awaitingReviewCount"
  | "errorCode"
  | "errorLog"
  | "created"
  | "lastUpdated";
export type IngestJobCreationAttributes = Optional<
  IngestJobAttributes,
  IngestJobOptionalAttributes
>;

export class IngestJob
  extends Model<IngestJobAttributes, IngestJobCreationAttributes>
  implements IngestJobAttributes
{
  declare id: string;
  declare moduleId: IngestModuleId;
  declare status: IngestJobStatus;
  declare dryRun: boolean;
  declare visibility: IngestVisibility;
  declare organizationId?: string | null;
  declare projectId?: string | null;
  declare cityId?: string | null;
  declare uploadedByUserId?: string | null;
  declare totalCount: number;
  declare completedCount: number;
  declare failedCount: number;
  declare skippedCount: number;
  declare awaitingReviewCount: number;
  declare errorCode?: string | null;
  declare errorLog?: string | null;
  declare created?: Date;
  declare lastUpdated?: Date;

  declare organization?: Organization | null;
  declare project?: Project | null;
  declare city?: City | null;
  declare uploadedBy?: User | null;
  declare items?: IngestItem[];
  declare getItems: Sequelize.HasManyGetAssociationsMixin<IngestItem>;
  declare addItem: Sequelize.HasManyAddAssociationMixin<IngestItem, IngestItemId>;

  static initModel(sequelize: Sequelize.Sequelize): typeof IngestJob {
    return IngestJob.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        moduleId: {
          type: DataTypes.STRING(32),
          allowNull: false,
          field: "module_id",
          validate: { isIn: [INGEST_MODULES] },
        },
        status: {
          type: DataTypes.STRING(32),
          allowNull: false,
          defaultValue: "pending",
          validate: { isIn: [INGEST_JOB_STATUSES] },
        },
        dryRun: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          field: "dry_run",
        },
        visibility: {
          type: DataTypes.STRING(16),
          allowNull: false,
          defaultValue: "city",
          validate: { isIn: [INGEST_VISIBILITIES] },
        },
        organizationId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "organization_id",
          references: { model: "Organization", key: "organization_id" },
        },
        projectId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "project_id",
          references: { model: "Project", key: "project_id" },
        },
        cityId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "city_id",
          references: { model: "City", key: "city_id" },
        },
        uploadedByUserId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "uploaded_by_user_id",
          references: { model: "User", key: "user_id" },
        },
        totalCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "total_count",
        },
        completedCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "completed_count",
        },
        failedCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "failed_count",
        },
        skippedCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "skipped_count",
        },
        awaitingReviewCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "awaiting_review_count",
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
        tableName: "IngestJob",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        underscored: true,
        indexes: [
          {
            name: "idx_ingest_job_status",
            fields: [{ name: "status" }],
          },
          {
            name: "idx_ingest_job_city_created",
            fields: [{ name: "city_id" }, { name: "created" }],
          },
        ],
      },
    );
  }
}
