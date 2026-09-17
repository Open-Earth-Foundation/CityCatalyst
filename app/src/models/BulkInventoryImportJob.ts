import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { Project, ProjectId } from "./Project";
import type { User, UserId } from "./User";
import type {
  BulkInventoryImportItem,
  BulkInventoryImportItemId,
} from "./BulkInventoryImportItem";
import {
  BulkInventoryImportJobStatus,
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

export const BULK_INVENTORY_IMPORT_JOB_STATUSES = Object.values(
  BulkInventoryImportJobStatus,
);

export interface BulkInventoryImportJobAttributes {
  id: string;
  projectId: string;
  year: number;
  userId?: string | null;
  status: BulkInventoryImportJobStatus;
  totalCount: number;
  matchedCount: number;
  importedCount: number;
  failedCount: number;
  skippedCount: number;
  s3Key?: string | null;
  dryRun: boolean;
  createMissingCities: boolean;
  inventoryType: InventoryTypeEnum;
  globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum;
  /**
   * When true, a later import run replaces an existing ImportedInventoryFile
   * for the same inventory. New file wins; the previous row is marked
   * failed/superseded. Inventory.hasOne(ImportedInventoryFile) is unchanged.
   */
  replaceExisting: boolean;
  created?: Date;
  lastUpdated?: Date;
}

export type BulkInventoryImportJobPk = "id";
export type BulkInventoryImportJobId =
  BulkInventoryImportJob[BulkInventoryImportJobPk];
export type BulkInventoryImportJobOptionalAttributes =
  | "id"
  | "userId"
  | "status"
  | "totalCount"
  | "matchedCount"
  | "importedCount"
  | "failedCount"
  | "skippedCount"
  | "s3Key"
  | "dryRun"
  | "createMissingCities"
  | "inventoryType"
  | "globalWarmingPotentialType"
  | "replaceExisting"
  | "created"
  | "lastUpdated";
export type BulkInventoryImportJobCreationAttributes = Optional<
  BulkInventoryImportJobAttributes,
  BulkInventoryImportJobOptionalAttributes
>;

export class BulkInventoryImportJob
  extends Model<
    BulkInventoryImportJobAttributes,
    BulkInventoryImportJobCreationAttributes
  >
  implements BulkInventoryImportJobAttributes
{
  declare id: string;
  declare projectId: string;
  declare year: number;
  declare userId?: string | null;
  declare status: BulkInventoryImportJobStatus;
  declare totalCount: number;
  declare matchedCount: number;
  declare importedCount: number;
  declare failedCount: number;
  declare skippedCount: number;
  declare s3Key?: string | null;
  declare dryRun: boolean;
  declare createMissingCities: boolean;
  declare inventoryType: InventoryTypeEnum;
  declare globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum;
  declare replaceExisting: boolean;
  declare created?: Date;
  declare lastUpdated?: Date;

  declare project?: Project;
  declare getProject: Sequelize.BelongsToGetAssociationMixin<Project>;
  declare setProject: Sequelize.BelongsToSetAssociationMixin<
    Project,
    ProjectId
  >;

  declare user?: User | null;
  declare getUser: Sequelize.BelongsToGetAssociationMixin<User>;
  declare setUser: Sequelize.BelongsToSetAssociationMixin<User, UserId>;

  declare items?: BulkInventoryImportItem[];
  declare getItems: Sequelize.HasManyGetAssociationsMixin<BulkInventoryImportItem>;
  declare addItem: Sequelize.HasManyAddAssociationMixin<
    BulkInventoryImportItem,
    BulkInventoryImportItemId
  >;
  declare addItems: Sequelize.HasManyAddAssociationsMixin<
    BulkInventoryImportItem,
    BulkInventoryImportItemId
  >;
  declare countItems: Sequelize.HasManyCountAssociationsMixin;

  static initModel(
    sequelize: Sequelize.Sequelize,
  ): typeof BulkInventoryImportJob {
    return BulkInventoryImportJob.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        projectId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "project_id",
          references: {
            model: "Project",
            key: "project_id",
          },
        },
        year: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "user_id",
          references: {
            model: "User",
            key: "user_id",
          },
        },
        status: {
          type: DataTypes.STRING(32),
          allowNull: false,
          defaultValue: BulkInventoryImportJobStatus.PENDING,
          validate: { isIn: [BULK_INVENTORY_IMPORT_JOB_STATUSES] },
        },
        totalCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "total_count",
        },
        matchedCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "matched_count",
        },
        importedCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "imported_count",
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
        s3Key: {
          type: DataTypes.STRING(1024),
          allowNull: true,
          field: "s3_key",
        },
        dryRun: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          field: "dry_run",
        },
        createMissingCities: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          field: "create_missing_cities",
        },
        inventoryType: {
          type: DataTypes.STRING(32),
          allowNull: false,
          defaultValue: InventoryTypeEnum.GPC_BASIC,
          field: "inventory_type",
          validate: { isIn: [Object.values(InventoryTypeEnum)] },
        },
        globalWarmingPotentialType: {
          type: DataTypes.STRING(8),
          allowNull: false,
          defaultValue: GlobalWarmingPotentialTypeEnum.ar6,
          field: "global_warming_potential_type",
          validate: { isIn: [Object.values(GlobalWarmingPotentialTypeEnum)] },
        },
        replaceExisting: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          field: "replace_existing",
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
        tableName: "BulkInventoryImportJob",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        underscored: true,
        indexes: [
          {
            name: "BulkInventoryImportJob_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
          {
            name: "idx_bulk_inventory_import_job_project_created",
            fields: [{ name: "project_id" }, { name: "created" }],
          },
          {
            name: "idx_bulk_inventory_import_job_status",
            fields: [{ name: "status" }],
          },
        ],
      },
    );
  }
}
