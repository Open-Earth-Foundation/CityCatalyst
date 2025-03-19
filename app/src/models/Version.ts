import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { Inventory, InventoryId } from "./Inventory";

export interface VersionAttributes {
  versionId: string;
  year?: number;
  version?: string;
  inventoryId?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type VersionPk = "versionId";
export type VersionId = Version[VersionPk];
export type VersionOptionalAttributes =
  | "year"
  | "version"
  | "inventoryId"
  | "created"
  | "lastUpdated";
export type VersionCreationAttributes = Optional<
  VersionAttributes,
  VersionOptionalAttributes
>;

export class Version
  extends Model<VersionAttributes, VersionCreationAttributes>
  implements Partial<VersionAttributes>
{
  versionId!: string;
  year?: number;
  version?: string;
  inventoryId?: string;
  created?: Date;
  lastUpdated?: Date;

  // Version belongsTo Inventory via inventoryId
  inventory!: Inventory;
  getInventory!: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  setInventory!: Sequelize.BelongsToSetAssociationMixin<Inventory, InventoryId>;
  createInventory!: Sequelize.BelongsToCreateAssociationMixin<Inventory>;

  static initModel(sequelize: Sequelize.Sequelize): typeof Version {
    return Version.init(
      {
        versionId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "version_id",
        },
        year: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        version: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        inventoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "Inventory",
            key: "inventory_id",
          },
          field: "inventory_id",
        },
      },
      {
        sequelize,
        tableName: "Version",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "Version_pkey",
            unique: true,
            fields: [{ name: "version_id" }],
          },
        ],
      },
    );
  }
}
