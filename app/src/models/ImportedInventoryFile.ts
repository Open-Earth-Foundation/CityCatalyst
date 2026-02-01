import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { User, UserId } from "./User";
import type { City, CityId } from "./City";
import type { Inventory, InventoryId } from "./Inventory";
import { ImportStatusEnum } from "@/util/enums";

export interface ImportedInventoryFileAttributes {
  id: string;
  userId: string;
  cityId: string;
  inventoryId: string;
  fileName: string;
  fileType: "xlsx" | "csv";
  fileSize: number;
  data?: Buffer | any;
  originalFileName: string;
  importStatus: ImportStatusEnum;
  mappingConfiguration?: Record<string, any> | null;
  validationResults?: Record<string, any> | null;
  errorLog?: string | null;
  rowCount?: number | null;
  processedRowCount?: number | null;
  created?: Date;
  lastUpdated?: Date;
  completedAt?: Date | null;
}

export type ImportedInventoryFilePk = "id";
export type ImportedInventoryFileId =
  ImportedInventoryFile[ImportedInventoryFilePk];
export type ImportedInventoryFileOptionalAttributes =
  | "data"
  | "mappingConfiguration"
  | "validationResults"
  | "errorLog"
  | "rowCount"
  | "processedRowCount"
  | "created"
  | "lastUpdated"
  | "completedAt";
export type ImportedInventoryFileCreationAttributes = Optional<
  ImportedInventoryFileAttributes,
  ImportedInventoryFileOptionalAttributes
>;

export class ImportedInventoryFile
  extends Model<
    ImportedInventoryFileAttributes,
    ImportedInventoryFileCreationAttributes
  >
  implements Partial<ImportedInventoryFileAttributes>
{
  declare id: string;
  declare userId: string;
  declare cityId: string;
  declare inventoryId: string;
  declare fileName: string;
  declare fileType: "xlsx" | "csv";
  declare fileSize: number;
  declare data?: Buffer | any;
  declare originalFileName: string;
  declare importStatus: ImportStatusEnum;
  declare mappingConfiguration?: Record<string, any> | null;
  declare validationResults?: Record<string, any> | null;
  declare errorLog?: string | null;
  declare rowCount?: number | null;
  declare processedRowCount?: number | null;
  declare created?: Date;
  declare lastUpdated?: Date;
  declare completedAt?: Date | null;

  // ImportedInventoryFile belongsTo User via userId
  declare user: User;
  declare getUser: Sequelize.BelongsToGetAssociationMixin<User>;
  declare setUser: Sequelize.BelongsToSetAssociationMixin<User, UserId>;
  declare createUser: Sequelize.BelongsToCreateAssociationMixin<User>;

  // ImportedInventoryFile belongsTo City via cityId
  declare city: City;
  declare getCity: Sequelize.BelongsToGetAssociationMixin<City>;
  declare setCity: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  declare createCity: Sequelize.BelongsToCreateAssociationMixin<City>;

  // ImportedInventoryFile belongsTo Inventory via inventoryId
  declare inventory: Inventory;
  declare getInventory: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  declare setInventory: Sequelize.BelongsToSetAssociationMixin<
    Inventory,
    InventoryId
  >;
  declare createInventory: Sequelize.BelongsToCreateAssociationMixin<Inventory>;

  static initModel(
    sequelize: Sequelize.Sequelize,
  ): typeof ImportedInventoryFile {
    return ImportedInventoryFile.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "id",
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "User",
            key: "user_id",
          },
          field: "user_id",
        },
        cityId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "City",
            key: "city_id",
          },
          field: "city_id",
        },
        inventoryId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "Inventory",
            key: "inventory_id",
          },
          field: "inventory_id",
        },
        fileName: {
          type: DataTypes.STRING(255),
          allowNull: false,
          field: "file_name",
        },
        fileType: {
          type: DataTypes.ENUM("xlsx", "csv"),
          allowNull: false,
          field: "file_type",
        },
        fileSize: {
          type: DataTypes.BIGINT,
          allowNull: false,
          field: "file_size",
        },
        data: {
          type: DataTypes.BLOB,
          allowNull: true,
        },
        originalFileName: {
          type: DataTypes.STRING(255),
          allowNull: false,
          field: "original_file_name",
        },
        importStatus: {
          type: DataTypes.ENUM(...Object.values(ImportStatusEnum)),
          allowNull: false,
          defaultValue: ImportStatusEnum.UPLOADED,
          field: "import_status",
        },
        mappingConfiguration: {
          type: DataTypes.JSONB,
          allowNull: true,
          field: "mapping_configuration",
        },
        validationResults: {
          type: DataTypes.JSONB,
          allowNull: true,
          field: "validation_results",
        },
        errorLog: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "error_log",
        },
        rowCount: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "row_count",
        },
        processedRowCount: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "processed_row_count",
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
        completedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "completed_at",
        },
      },
      {
        sequelize,
        tableName: "ImportedInventoryFile",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        underscored: true,
        indexes: [
          {
            name: "ImportedInventoryFile_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
          {
            name: "idx_imported_inventory_file_inventory_id",
            fields: [{ name: "inventory_id" }],
          },
          {
            name: "idx_imported_inventory_file_status",
            fields: [{ name: "import_status" }],
          },
          {
            name: "idx_imported_inventory_file_user_id",
            fields: [{ name: "user_id" }],
          },
          {
            name: "idx_imported_inventory_file_city_id",
            fields: [{ name: "city_id" }],
          },
        ],
      },
    );
  }
}
