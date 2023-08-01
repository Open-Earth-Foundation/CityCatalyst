import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { Inventory, InventoryId } from './Inventory';
import type { Sector, SectorId } from './Sector';
import type { SubCategoryValue, SubCategoryValueId } from './SubCategoryValue';
import type { SubSectorValue, SubSectorValueId } from './SubSectorValue';

export interface SectorValueAttributes {
  sector_value_id: string;
  total_emissions?: number;
  sector_id?: string;
  inventory_id?: string;
  created?: Date;
  last_updated?: Date;
}

export type SectorValuePk = "sector_value_id";
export type SectorValueId = SectorValue[SectorValuePk];
export type SectorValueOptionalAttributes = "total_emissions" | "sector_id" | "inventory_id" | "created" | "last_updated";
export type SectorValueCreationAttributes = Optional<SectorValueAttributes, SectorValueOptionalAttributes>;

export class SectorValue extends Model<SectorValueAttributes, SectorValueCreationAttributes> implements SectorValueAttributes {
  sector_value_id!: string;
  total_emissions?: number;
  sector_id?: string;
  inventory_id?: string;
  created?: Date;
  last_updated?: Date;

  // SectorValue belongsTo Inventory via inventory_id
  inventory!: Inventory;
  getInventory!: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  setInventory!: Sequelize.BelongsToSetAssociationMixin<Inventory, InventoryId>;
  createInventory!: Sequelize.BelongsToCreateAssociationMixin<Inventory>;
  // SectorValue belongsTo Sector via sector_id
  sector!: Sector;
  getSector!: Sequelize.BelongsToGetAssociationMixin<Sector>;
  setSector!: Sequelize.BelongsToSetAssociationMixin<Sector, SectorId>;
  createSector!: Sequelize.BelongsToCreateAssociationMixin<Sector>;
  // SectorValue hasMany SubCategoryValue via sector_value_id
  SubCategoryValues!: SubCategoryValue[];
  getSubCategoryValues!: Sequelize.HasManyGetAssociationsMixin<SubCategoryValue>;
  setSubCategoryValues!: Sequelize.HasManySetAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  addSubCategoryValue!: Sequelize.HasManyAddAssociationMixin<SubCategoryValue, SubCategoryValueId>;
  addSubCategoryValues!: Sequelize.HasManyAddAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  createSubCategoryValue!: Sequelize.HasManyCreateAssociationMixin<SubCategoryValue>;
  removeSubCategoryValue!: Sequelize.HasManyRemoveAssociationMixin<SubCategoryValue, SubCategoryValueId>;
  removeSubCategoryValues!: Sequelize.HasManyRemoveAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  hasSubCategoryValue!: Sequelize.HasManyHasAssociationMixin<SubCategoryValue, SubCategoryValueId>;
  hasSubCategoryValues!: Sequelize.HasManyHasAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  countSubCategoryValues!: Sequelize.HasManyCountAssociationsMixin;
  // SectorValue hasMany SubSectorValue via sector_value_id
  SubSectorValues!: SubSectorValue[];
  getSubSectorValues!: Sequelize.HasManyGetAssociationsMixin<SubSectorValue>;
  setSubSectorValues!: Sequelize.HasManySetAssociationsMixin<SubSectorValue, SubSectorValueId>;
  addSubSectorValue!: Sequelize.HasManyAddAssociationMixin<SubSectorValue, SubSectorValueId>;
  addSubSectorValues!: Sequelize.HasManyAddAssociationsMixin<SubSectorValue, SubSectorValueId>;
  createSubSectorValue!: Sequelize.HasManyCreateAssociationMixin<SubSectorValue>;
  removeSubSectorValue!: Sequelize.HasManyRemoveAssociationMixin<SubSectorValue, SubSectorValueId>;
  removeSubSectorValues!: Sequelize.HasManyRemoveAssociationsMixin<SubSectorValue, SubSectorValueId>;
  hasSubSectorValue!: Sequelize.HasManyHasAssociationMixin<SubSectorValue, SubSectorValueId>;
  hasSubSectorValues!: Sequelize.HasManyHasAssociationsMixin<SubSectorValue, SubSectorValueId>;
  countSubSectorValues!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof SectorValue {
    return SectorValue.init({
    sector_value_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    total_emissions: {
      type: DataTypes.DECIMAL,
      allowNull: true
    },
    sector_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Sector',
        key: 'sector_id'
      }
    },
    inventory_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Inventory',
        key: 'inventory_id'
      }
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_updated: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'SectorValue',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "SectorValue_pkey",
        unique: true,
        fields: [
          { name: "sector_value_id" },
        ]
      },
    ]
  });
  }
}
