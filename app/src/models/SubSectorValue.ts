import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { EmissionsFactor, EmissionsFactorId } from './EmissionsFactor';
import type { Inventory, InventoryId } from './Inventory';
import type { SectorValue, SectorValueId } from './SectorValue';
import type { SubSector, SubSectorId } from './SubSector';

export interface SubSectorValueAttributes {
  subsector_value_id: string;
  activity_units?: string;
  activity_value?: number;
  emission_factor_value?: number;
  total_emissions?: number;
  emissions_factor_id?: string;
  subsector_id?: string;
  sector_value_id?: string;
  inventory_id?: string;
  created?: Date;
  last_updated?: Date;
}

export type SubSectorValuePk = "subsector_value_id";
export type SubSectorValueId = SubSectorValue[SubSectorValuePk];
export type SubSectorValueOptionalAttributes = "activity_units" | "activity_value" | "emission_factor_value" | "total_emissions" | "emissions_factor_id" | "subsector_id" | "sector_value_id" | "inventory_id" | "created" | "last_updated";
export type SubSectorValueCreationAttributes = Optional<SubSectorValueAttributes, SubSectorValueOptionalAttributes>;

export class SubSectorValue extends Model<SubSectorValueAttributes, SubSectorValueCreationAttributes> implements SubSectorValueAttributes {
  subsector_value_id!: string;
  activity_units?: string;
  activity_value?: number;
  emission_factor_value?: number;
  total_emissions?: number;
  emissions_factor_id?: string;
  subsector_id?: string;
  sector_value_id?: string;
  inventory_id?: string;
  created?: Date;
  last_updated?: Date;

  // SubSectorValue belongsTo EmissionsFactor via emissions_factor_id
  emissions_factor!: EmissionsFactor;
  getEmissions_factor!: Sequelize.BelongsToGetAssociationMixin<EmissionsFactor>;
  setEmissions_factor!: Sequelize.BelongsToSetAssociationMixin<EmissionsFactor, EmissionsFactorId>;
  createEmissions_factor!: Sequelize.BelongsToCreateAssociationMixin<EmissionsFactor>;
  // SubSectorValue belongsTo Inventory via inventory_id
  inventory!: Inventory;
  getInventory!: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  setInventory!: Sequelize.BelongsToSetAssociationMixin<Inventory, InventoryId>;
  createInventory!: Sequelize.BelongsToCreateAssociationMixin<Inventory>;
  // SubSectorValue belongsTo SectorValue via sector_value_id
  sector_value!: SectorValue;
  getSector_value!: Sequelize.BelongsToGetAssociationMixin<SectorValue>;
  setSector_value!: Sequelize.BelongsToSetAssociationMixin<SectorValue, SectorValueId>;
  createSector_value!: Sequelize.BelongsToCreateAssociationMixin<SectorValue>;
  // SubSectorValue belongsTo SubSector via subsector_id
  subsector!: SubSector;
  getSubsector!: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  setSubsector!: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  createSubsector!: Sequelize.BelongsToCreateAssociationMixin<SubSector>;

  static initModel(sequelize: Sequelize.Sequelize): typeof SubSectorValue {
    return SubSectorValue.init({
    subsector_value_id: {
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
    subsector_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'SubSector',
        key: 'subsector_id'
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
    tableName: 'SubSectorValue',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "SubSectorValue_pkey",
        unique: true,
        fields: [
          { name: "subsector_value_id" },
        ]
      },
    ]
  });
  }
}
