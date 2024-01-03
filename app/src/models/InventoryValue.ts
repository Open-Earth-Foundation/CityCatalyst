import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { EmissionsFactor, EmissionsFactorId } from "./EmissionsFactor";
import type { Inventory, InventoryId } from "./Inventory";
import type { SubCategory, SubCategoryId } from "./SubCategory";
import type { DataSource, DataSourceId } from "./DataSource";

export interface InventoryValueAttributes {
  id: string;
  gpcReferenceNumber?: string;
  activityValue?: number;
  activityUnits?: string;
  co2eq?: BigInt;
  co2eqYears?: number;
  sectorId?: string;
  subSectorId?: string;
  scopeId?: string;
  inventoryId?: string;
  dataSourceId?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type InventoryValuePk = "id";
export type InventoryValueId = InventoryValue[InventoryValuePk];
export type InventoryValueOptionalAttributes =
  | "gpcReferenceNumber"
  | "activityValue"
  | "activityUnits"
  | "co2eq"
  | "co2eqYears"
  | "sectorId"
  | "subSectorId"
  | "scopeId"
  | "inventoryId"
  | "dataSourceId"
  | "created"
  | "lastUpdated";
export type InventoryValueCreationAttributes = Optional<
  InventoryValueAttributes,
  InventoryValueOptionalAttributes
>;

export class InventoryValue
  extends Model<InventoryValueAttributes, InventoryValueCreationAttributes>
  implements InventoryValueAttributes
{
  id!: string;
  gpcReferenceNumber?: string;
  activityValue?: number;
  activityUnits?: string;
  co2eq?: BigInt;
  co2eqYears?: number;
  sectorId?: string;
  subSectorId?: string;
  scopeId?: string;
  inventoryId?: string;
  dataSourceId?: string;
  created?: Date;
  lastUpdated?: Date;

  // InventoryValue belongsTo Inventory via inventoryId
  inventory!: Inventory;
  getInventory!: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  setInventory!: Sequelize.BelongsToSetAssociationMixin<Inventory, InventoryId>;
  createInventory!: Sequelize.BelongsToCreateAssociationMixin<Inventory>;
  // InventoryValue belongsTo SubCategory via subcategoryId
  subcategory!: SubCategory;
  getSubcategory!: Sequelize.BelongsToGetAssociationMixin<SubCategory>;
  setSubcategory!: Sequelize.BelongsToSetAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  createSubcategory!: Sequelize.BelongsToCreateAssociationMixin<SubCategory>;
  // InventoryValue belongsTo DataSource via datasourceId
  dataSource!: DataSource;
  getDataSource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDataSource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDataSource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;

  static initModel(sequelize: Sequelize.Sequelize): typeof InventoryValue {
    return InventoryValue.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "id",
        },
        gpcReferenceNumber: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "gpc_reference_number",
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
        scopeId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "SubCategory",
            key: "subcategory_id",
          },
          field: "scope_id",
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
        dataSourceId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "DataSource",
            key: "datasource_id",
          },
          field: "data_source_id",
        },
      },
      {
        sequelize,
        tableName: "InventoryValue",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "InventoryValue_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
        ],
      },
    );
  }
}
