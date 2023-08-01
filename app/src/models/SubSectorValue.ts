import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { EmissionsFactor, EmissionsFactorId } from './EmissionsFactor';
import type { Inventory, InventoryId } from './Inventory';
import type { SectorValue, SectorValueId } from './SectorValue';
import type { SubSector, SubSectorId } from './SubSector';

export interface SubSectorValueAttributes {
  subsectorValueId: string;
  activityUnits?: string;
  activityValue?: number;
  emissionFactorValue?: number;
  totalEmissions?: number;
  emissionsFactorId?: string;
  subsectorId?: string;
  sectorValueId?: string;
  inventoryId?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type SubSectorValuePk = "subsectorValueId";
export type SubSectorValueId = SubSectorValue[SubSectorValuePk];
export type SubSectorValueOptionalAttributes = "activityUnits" | "activityValue" | "emissionFactorValue" | "totalEmissions" | "emissionsFactorId" | "subsectorId" | "sectorValueId" | "inventoryId" | "created" | "lastUpdated";
export type SubSectorValueCreationAttributes = Optional<SubSectorValueAttributes, SubSectorValueOptionalAttributes>;

export class SubSectorValue extends Model<SubSectorValueAttributes, SubSectorValueCreationAttributes> implements SubSectorValueAttributes {
  subsectorValueId!: string;
  activityUnits?: string;
  activityValue?: number;
  emissionFactorValue?: number;
  totalEmissions?: number;
  emissionsFactorId?: string;
  subsectorId?: string;
  sectorValueId?: string;
  inventoryId?: string;
  created?: Date;
  lastUpdated?: Date;

  // SubSectorValue belongsTo EmissionsFactor via emissionsFactorId
  emissionsFactor!: EmissionsFactor;
  getEmissionsFactor!: Sequelize.BelongsToGetAssociationMixin<EmissionsFactor>;
  setEmissionsFactor!: Sequelize.BelongsToSetAssociationMixin<EmissionsFactor, EmissionsFactorId>;
  createEmissionsFactor!: Sequelize.BelongsToCreateAssociationMixin<EmissionsFactor>;
  // SubSectorValue belongsTo Inventory via inventoryId
  inventory!: Inventory;
  getInventory!: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  setInventory!: Sequelize.BelongsToSetAssociationMixin<Inventory, InventoryId>;
  createInventory!: Sequelize.BelongsToCreateAssociationMixin<Inventory>;
  // SubSectorValue belongsTo SectorValue via sectorValueId
  sectorValue!: SectorValue;
  getSectorValue!: Sequelize.BelongsToGetAssociationMixin<SectorValue>;
  setSectorValue!: Sequelize.BelongsToSetAssociationMixin<SectorValue, SectorValueId>;
  createSectorValue!: Sequelize.BelongsToCreateAssociationMixin<SectorValue>;
  // SubSectorValue belongsTo SubSector via subsectorId
  subsector!: SubSector;
  getSubsector!: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  setSubsector!: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  createSubsector!: Sequelize.BelongsToCreateAssociationMixin<SubSector>;

  static initModel(sequelize: Sequelize.Sequelize): typeof SubSectorValue {
    return SubSectorValue.init({
    subsectorValueId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      field: 'subsector_value_id'
    },
    activityUnits: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'activity_units'
    },
    activityValue: {
      type: DataTypes.DECIMAL,
      allowNull: true,
      field: 'activity_value'
    },
    emissionFactorValue: {
      type: DataTypes.DECIMAL,
      allowNull: true,
      field: 'emission_factor_value'
    },
    totalEmissions: {
      type: DataTypes.DECIMAL,
      allowNull: true,
      field: 'total_emissions'
    },
    emissionsFactorId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'EmissionsFactor',
        key: 'emissions_factor_id'
      },
      field: 'emissions_factor_id'
    },
    subsectorId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'SubSector',
        key: 'subsector_id'
      },
      field: 'subsector_id'
    },
    sectorValueId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'SectorValue',
        key: 'sector_value_id'
      },
      field: 'sector_value_id'
    },
    inventoryId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Inventory',
        key: 'inventory_id'
      },
      field: 'inventory_id'
    }
  }, {
    sequelize,
    tableName: 'SubSectorValue',
    schema: 'public',
    timestamps: true,
    createdAt: 'created',
    updatedAt: 'last_updated',
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
