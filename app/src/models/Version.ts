import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { Inventory, InventoryId } from './Inventory';

export interface VersionAttributes {
  version_id: string;
  year?: number;
  version?: string;
  inventory_id?: string;
}

export type VersionPk = "version_id";
export type VersionId = Version[VersionPk];
export type VersionOptionalAttributes = "year" | "version" | "inventory_id";
export type VersionCreationAttributes = Optional<VersionAttributes, VersionOptionalAttributes>;

export class Version extends Model<VersionAttributes, VersionCreationAttributes> implements VersionAttributes {
  version_id!: string;
  year?: number;
  version?: string;
  inventory_id?: string;

  // Version belongsTo Inventory via inventory_id
  inventory!: Inventory;
  getInventory!: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  setInventory!: Sequelize.BelongsToSetAssociationMixin<Inventory, InventoryId>;
  createInventory!: Sequelize.BelongsToCreateAssociationMixin<Inventory>;

  static initModel(sequelize: Sequelize.Sequelize): typeof Version {
    return Version.init({
    version_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    version: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    inventory_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Inventory',
        key: 'inventory_id'
      }
    }
  }, {
    sequelize,
    tableName: 'Version',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "Version_pkey",
        unique: true,
        fields: [
          { name: "version_id" },
        ]
      },
    ]
  });
  }
}
