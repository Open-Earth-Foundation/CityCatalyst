import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { EmissionsFactor, EmissionsFactorId } from "./EmissionsFactor";
import type { Inventory, InventoryId } from "./Inventory";
import type { SectorValue, SectorValueId } from "./SectorValue";
import type { SubCategory, SubCategoryId } from "./SubCategory";
import type { DataSource, DataSourceId } from "./DataSource";

export interface SubCategoryValueAttributes {
  subcategoryValueId: string;
  activityUnits?: string;
  activityValue?: number;
  emissionFactorValue?: number;
  totalEmissions?: number;
  emissionsFactorId?: string;
  subcategoryId?: string;
  sectorValueId?: string;
  inventoryId?: string;
  datasourceId?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type SubCategoryValuePk = "subcategoryValueId";
export type SubCategoryValueId = SubCategoryValue[SubCategoryValuePk];
export type SubCategoryValueOptionalAttributes =
  | "activityUnits"
  | "activityValue"
  | "emissionFactorValue"
  | "totalEmissions"
  | "emissionsFactorId"
  | "subcategoryId"
  | "sectorValueId"
  | "inventoryId"
  | "datasourceId" 
  | "created"
  | "lastUpdated";
export type SubCategoryValueCreationAttributes = Optional<
  SubCategoryValueAttributes,
  SubCategoryValueOptionalAttributes
>;

export class SubCategoryValue
  extends Model<SubCategoryValueAttributes, SubCategoryValueCreationAttributes>
  implements SubCategoryValueAttributes
{
  subcategoryValueId!: string;
  activityUnits?: string;
  activityValue?: number;
  emissionFactorValue?: number;
  totalEmissions?: number;
  emissionsFactorId?: string;
  subcategoryId?: string;
  sectorValueId?: string;
  inventoryId?: string;
  datasourceId?: string;
  created?: Date;
  lastUpdated?: Date;

  // SubCategoryValue belongsTo EmissionsFactor via emissionsFactorId
  emissionsFactor!: EmissionsFactor;
  getEmissionsFactor!: Sequelize.BelongsToGetAssociationMixin<EmissionsFactor>;
  setEmissionsFactor!: Sequelize.BelongsToSetAssociationMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  createEmissionsFactor!: Sequelize.BelongsToCreateAssociationMixin<EmissionsFactor>;
  // SubCategoryValue belongsTo Inventory via inventoryId
  inventory!: Inventory;
  getInventory!: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  setInventory!: Sequelize.BelongsToSetAssociationMixin<Inventory, InventoryId>;
  createInventory!: Sequelize.BelongsToCreateAssociationMixin<Inventory>;
  // SubCategoryValue belongsTo SectorValue via sectorValueId
  sectorValue!: SectorValue;
  getSectorValue!: Sequelize.BelongsToGetAssociationMixin<SectorValue>;
  setSectorValue!: Sequelize.BelongsToSetAssociationMixin<
    SectorValue,
    SectorValueId
  >;
  createSectorValue!: Sequelize.BelongsToCreateAssociationMixin<SectorValue>;
  // SubCategoryValue belongsTo SubCategory via subcategoryId
  subcategory!: SubCategory;
  getSubcategory!: Sequelize.BelongsToGetAssociationMixin<SubCategory>;
  setSubcategory!: Sequelize.BelongsToSetAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  createSubcategory!: Sequelize.BelongsToCreateAssociationMixin<SubCategory>;
  // SubCategoryValue belongsTo DataSource via datasourceId
  dataSource!: DataSource;
  getDataSource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDataSource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDataSource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;

  static initModel(sequelize: Sequelize.Sequelize): typeof SubCategoryValue {
    return SubCategoryValue.init(
      {
        subcategoryValueId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "subcategory_value_id",
        },
        activityUnits: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "activity_units",
        },
        activityValue: {
          type: DataTypes.DECIMAL,
          allowNull: true,
          field: "activity_value",
        },
        emissionFactorValue: {
          type: DataTypes.DECIMAL,
          allowNull: true,
          field: "emission_factor_value",
        },
        totalEmissions: {
          type: DataTypes.DECIMAL,
          allowNull: true,
          field: "total_emissions",
        },
        emissionsFactorId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "EmissionsFactor",
            key: "emissions_factor_id",
          },
          field: "emissions_factor_id",
        },
        subcategoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "SubCategory",
            key: "subcategory_id",
          },
          field: "subcategory_id",
        },
        sectorValueId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "SectorValue",
            key: "sector_value_id",
          },
          field: "sector_value_id",
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
        datasourceId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "DataSource",
            key: "datasource_id",
          },
          field: "datasource_id",
        },
      },
      {
        sequelize,
        tableName: "SubCategoryValue",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "SubCategoryValue_pkey",
            unique: true,
            fields: [{ name: "subcategory_value_id" }],
          },
        ],
      },
    );
  }
}
