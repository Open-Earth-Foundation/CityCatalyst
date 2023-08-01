import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { EmissionsFactor, EmissionsFactorId } from './EmissionsFactor';
import type { Inventory, InventoryId } from './Inventory';
import type { SectorValue, SectorValueId } from './SectorValue';
import type { SubCategory, SubCategoryId } from './SubCategory';

export interface SubCategoryValueAttributes {
  subcategory_value_id: string;
  activity_units?: string;
  activity_value?: number;
  emission_factor_value?: number;
  total_emissions?: number;
  emissions_factor_id?: string;
  subcategory_id?: string;
  sector_value_id?: string;
  inventory_id?: string;
  created?: Date;
  last_updated?: Date;
}

export type SubCategoryValuePk = "subcategory_value_id";
export type SubCategoryValueId = SubCategoryValue[SubCategoryValuePk];
export type SubCategoryValueOptionalAttributes = "activity_units" | "activity_value" | "emission_factor_value" | "total_emissions" | "emissions_factor_id" | "subcategory_id" | "sector_value_id" | "inventory_id" | "created" | "last_updated";
export type SubCategoryValueCreationAttributes = Optional<SubCategoryValueAttributes, SubCategoryValueOptionalAttributes>;

export class SubCategoryValue extends Model<SubCategoryValueAttributes, SubCategoryValueCreationAttributes> implements SubCategoryValueAttributes {
  subcategory_value_id!: string;
  activity_units?: string;
  activity_value?: number;
  emission_factor_value?: number;
  total_emissions?: number;
  emissions_factor_id?: string;
  subcategory_id?: string;
  sector_value_id?: string;
  inventory_id?: string;
  created?: Date;
  last_updated?: Date;

  // SubCategoryValue belongsTo EmissionsFactor via emissions_factor_id
  emissions_factor!: EmissionsFactor;
  getEmissions_factor!: Sequelize.BelongsToGetAssociationMixin<EmissionsFactor>;
  setEmissions_factor!: Sequelize.BelongsToSetAssociationMixin<EmissionsFactor, EmissionsFactorId>;
  createEmissions_factor!: Sequelize.BelongsToCreateAssociationMixin<EmissionsFactor>;
  // SubCategoryValue belongsTo Inventory via inventory_id
  inventory!: Inventory;
  getInventory!: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  setInventory!: Sequelize.BelongsToSetAssociationMixin<Inventory, InventoryId>;
  createInventory!: Sequelize.BelongsToCreateAssociationMixin<Inventory>;
  // SubCategoryValue belongsTo SectorValue via sector_value_id
  sector_value!: SectorValue;
  getSector_value!: Sequelize.BelongsToGetAssociationMixin<SectorValue>;
  setSector_value!: Sequelize.BelongsToSetAssociationMixin<SectorValue, SectorValueId>;
  createSector_value!: Sequelize.BelongsToCreateAssociationMixin<SectorValue>;
  // SubCategoryValue belongsTo SubCategory via subcategory_id
  subcategory!: SubCategory;
  getSubcategory!: Sequelize.BelongsToGetAssociationMixin<SubCategory>;
  setSubcategory!: Sequelize.BelongsToSetAssociationMixin<SubCategory, SubCategoryId>;
  createSubcategory!: Sequelize.BelongsToCreateAssociationMixin<SubCategory>;

  static initModel(sequelize: Sequelize.Sequelize): typeof SubCategoryValue {
    return SubCategoryValue.init({
    subcategory_value_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    activity_units: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    activity_value: {
      type: DataTypes.DECIMAL,
      allowNull: true
    },
    emission_factor_value: {
      type: DataTypes.DECIMAL,
      allowNull: true
    },
    total_emissions: {
      type: DataTypes.DECIMAL,
      allowNull: true
    },
    emissions_factor_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'EmissionsFactor',
        key: 'emissions_factor_id'
      }
    },
    subcategory_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'SubCategory',
        key: 'subcategory_id'
      }
    },
    sector_value_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'SectorValue',
        key: 'sector_value_id'
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
    tableName: 'SubCategoryValue',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "SubCategoryValue_pkey",
        unique: true,
        fields: [
          { name: "subcategory_value_id" },
        ]
      },
    ]
  });
  }
}
