import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { City, CityId } from "./City";
import type { Inventory, InventoryId } from "./Inventory";
import type {
  ImportedInventoryFile,
  ImportedInventoryFileId,
} from "./ImportedInventoryFile";
import type {
  BulkInventoryImportJob,
  BulkInventoryImportJobId,
} from "./BulkInventoryImportJob";
import { BulkInventoryImportItemStatus } from "@/util/enums";

export const BULK_INVENTORY_IMPORT_ITEM_STATUSES = Object.values(
  BulkInventoryImportItemStatus,
);

export interface BulkInventoryImportItemAttributes {
  id: string;
  jobId: string;
  originalFileName: string;
  s3Key?: string | null;
  cityId?: string | null;
  inventoryId?: string | null;
  locode?: string | null;
  importedFileId?: string | null;
  resolvedYear?: number | null;
  status: BulkInventoryImportItemStatus;
  /** Fine-grained phase while status is importing (validating, replacing, …). */
  stage?: string | null;
  errorCode?: string | null;
  errorLog?: string | null;
  warnings?: string[] | null;
  /** Dev fallback when S3 is not configured; same idea as ImportedInventoryFile.data. */
  data?: Buffer | Uint8Array | null;
  created?: Date;
  lastUpdated?: Date;
}

export type BulkInventoryImportItemPk = "id";
export type BulkInventoryImportItemId =
  BulkInventoryImportItem[BulkInventoryImportItemPk];
export type BulkInventoryImportItemOptionalAttributes =
  | "id"
  | "s3Key"
  | "cityId"
  | "inventoryId"
  | "locode"
  | "importedFileId"
  | "resolvedYear"
  | "status"
  | "stage"
  | "errorCode"
  | "errorLog"
  | "warnings"
  | "data"
  | "created"
  | "lastUpdated";
export type BulkInventoryImportItemCreationAttributes = Optional<
  BulkInventoryImportItemAttributes,
  BulkInventoryImportItemOptionalAttributes
>;

export class BulkInventoryImportItem
  extends Model<
    BulkInventoryImportItemAttributes,
    BulkInventoryImportItemCreationAttributes
  >
  implements BulkInventoryImportItemAttributes
{
  declare id: string;
  declare jobId: string;
  declare originalFileName: string;
  declare s3Key?: string | null;
  declare cityId?: string | null;
  declare inventoryId?: string | null;
  declare locode?: string | null;
  declare importedFileId?: string | null;
  declare resolvedYear?: number | null;
  declare status: BulkInventoryImportItemStatus;
  declare stage?: string | null;
  declare errorCode?: string | null;
  declare errorLog?: string | null;
  declare warnings?: string[] | null;
  declare data?: Buffer | Uint8Array | null;
  declare created?: Date;
  declare lastUpdated?: Date;

  declare job?: BulkInventoryImportJob;
  declare getJob: Sequelize.BelongsToGetAssociationMixin<BulkInventoryImportJob>;
  declare setJob: Sequelize.BelongsToSetAssociationMixin<
    BulkInventoryImportJob,
    BulkInventoryImportJobId
  >;

  declare city?: City | null;
  declare getCity: Sequelize.BelongsToGetAssociationMixin<City>;
  declare setCity: Sequelize.BelongsToSetAssociationMixin<City, CityId>;

  declare inventory?: Inventory | null;
  declare getInventory: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  declare setInventory: Sequelize.BelongsToSetAssociationMixin<
    Inventory,
    InventoryId
  >;

  declare importedFile?: ImportedInventoryFile | null;
  declare getImportedFile: Sequelize.BelongsToGetAssociationMixin<ImportedInventoryFile>;
  declare setImportedFile: Sequelize.BelongsToSetAssociationMixin<
    ImportedInventoryFile,
    ImportedInventoryFileId
  >;

  static initModel(
    sequelize: Sequelize.Sequelize,
  ): typeof BulkInventoryImportItem {
    return BulkInventoryImportItem.init(
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
          references: {
            model: "BulkInventoryImportJob",
            key: "id",
          },
        },
        originalFileName: {
          type: DataTypes.STRING(512),
          allowNull: false,
          field: "original_file_name",
        },
        s3Key: {
          type: DataTypes.STRING(1024),
          allowNull: true,
          field: "s3_key",
        },
        cityId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "city_id",
          references: {
            model: "City",
            key: "city_id",
          },
        },
        inventoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "inventory_id",
          references: {
            model: "Inventory",
            key: "inventory_id",
          },
        },
        locode: {
          type: DataTypes.STRING(32),
          allowNull: true,
        },
        importedFileId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "imported_file_id",
          references: {
            model: "ImportedInventoryFile",
            key: "id",
          },
        },
        resolvedYear: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "resolved_year",
        },
        status: {
          type: DataTypes.STRING(32),
          allowNull: false,
          defaultValue: BulkInventoryImportItemStatus.PENDING,
          validate: { isIn: [BULK_INVENTORY_IMPORT_ITEM_STATUSES] },
        },
        stage: {
          type: DataTypes.STRING(64),
          allowNull: true,
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
        data: {
          type: DataTypes.BLOB,
          allowNull: true,
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
        tableName: "BulkInventoryImportItem",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        underscored: true,
        indexes: [
          {
            name: "BulkInventoryImportItem_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
          {
            name: "idx_bulk_inventory_import_item_job_status",
            fields: [{ name: "job_id" }, { name: "status" }],
          },
          {
            name: "idx_bulk_inventory_import_item_city_id",
            fields: [{ name: "city_id" }],
          },
        ],
      },
    );
  }
}
