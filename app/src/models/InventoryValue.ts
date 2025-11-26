import type { Optional } from "sequelize";
import * as Sequelize from "sequelize";
import { DataTypes, Model } from "sequelize";
import type { Inventory, InventoryId } from "./Inventory";
import type { SubCategory, SubCategoryId } from "./SubCategory";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";
import type { Sector, SectorId } from "./Sector";
import type { SubSector, SubSectorId } from "./SubSector";
import type { GasValue, GasValueId } from "./GasValue";
import type { ActivityValue, ActivityValueId } from "./ActivityValue";

export interface InventoryValueAttributes {
  id: string;
  gpcReferenceNumber?: string;
  /** @deprecated moved to ActivityValue */
  activityValue?: number | null; // TODO remove
  /** @deprecated moved to ActivityValue */
  activityUnits?: string | null; // TODO remove
  co2eq?: bigint;
  co2eqYears?: number;
  unavailableReason?: string | null;
  unavailableExplanation?: string | null;
  inputMethodology?: string;
  sectorId?: string;
  subSectorId?: string;
  subCategoryId?: string;
  inventoryId?: string;
  datasourceId?: string | null; // TODO remove
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
  | "unavailableReason"
  | "unavailableExplanation"
  | "inputMethodology"
  | "sectorId"
  | "subSectorId"
  | "subCategoryId"
  | "inventoryId"
  | "datasourceId"
  | "created"
  | "lastUpdated";
export type InventoryValueCreationAttributes = Optional<
  InventoryValueAttributes,
  InventoryValueOptionalAttributes
>;

export class InventoryValue
  extends Model<InventoryValueAttributes, InventoryValueCreationAttributes>
  implements Partial<InventoryValueAttributes>
{
  declare id: string;
  declare gpcReferenceNumber?: string;
  /** @deprecated moved to ActivityValue */
  declare activityValue?: number | null; // TODO remove
  /** @deprecated moved to ActivityValue */
  declare activityUnits?: string | null; // TODO remove
  declare co2eq?: bigint;
  declare co2eqYears?: number;
  declare unavailableReason?: string | null;
  declare unavailableExplanation?: string | null;
  declare inputMethodology?: string;
  declare sectorId?: string;
  declare subSectorId?: string;
  declare subCategoryId?: string;
  declare inventoryId?: string;
  declare datasourceId?: string | null;
  declare created?: Date;
  declare lastUpdated?: Date;

  // InventoryValue belongsTo Inventory via inventoryId
  declare inventory: Inventory;
  declare getInventory: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  declare setInventory: Sequelize.BelongsToSetAssociationMixin<Inventory, InventoryId>;
  declare createInventory: Sequelize.BelongsToCreateAssociationMixin<Inventory>;
  // InventoryValue belongsTo SubCategory via subcategoryId
  declare sector: Sector;
  declare getSector: Sequelize.BelongsToGetAssociationMixin<Sector>;
  declare setSector: Sequelize.BelongsToSetAssociationMixin<Sector, SectorId>;
  declare createSector: Sequelize.BelongsToCreateAssociationMixin<Sector>;
  // InventoryValue belongsTo SubCategory via subcategoryId
  declare subSector: SubSector;
  declare getSubSector: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  declare setSubSector: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  declare createSubSector: Sequelize.BelongsToCreateAssociationMixin<SubSector>;
  // InventoryValue belongsTo SubCategory via subcategoryId
  declare subcategory: SubCategory;
  declare getSubcategory: Sequelize.BelongsToGetAssociationMixin<SubCategory>;
  declare setSubcategory: Sequelize.BelongsToSetAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  declare createSubcategory: Sequelize.BelongsToCreateAssociationMixin<SubCategory>;
  // InventoryValue belongsTo DataSource via datasourceId
  declare dataSource?: DataSource;
  declare getDataSource: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  declare setDataSource: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare createDataSource: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // InventoryValue hasMany GasValue via inventoryValueId
  declare gasValues: GasValue[];
  declare getGasValues: Sequelize.HasManyGetAssociationsMixin<GasValue>;
  declare setGasValues: Sequelize.HasManySetAssociationsMixin<GasValue, GasValueId>;
  declare addGasValue: Sequelize.HasManyAddAssociationMixin<GasValue, GasValueId>;
  declare addGasValues: Sequelize.HasManyAddAssociationsMixin<GasValue, GasValueId>;
  declare createGasValue: Sequelize.HasManyCreateAssociationMixin<GasValue>;
  declare removeGasValue: Sequelize.HasManyRemoveAssociationMixin<
    GasValue,
    GasValueId
  >;
  declare removeGasValues: Sequelize.HasManyRemoveAssociationsMixin<
    GasValue,
    GasValueId
  >;
  declare hasGasValue: Sequelize.HasManyHasAssociationMixin<GasValue, GasValueId>;
  declare hasGasValues: Sequelize.HasManyHasAssociationsMixin<GasValue, GasValueId>;
  declare countGasValues: Sequelize.HasManyCountAssociationsMixin;

  // InventoryValue hasMany ActivityValue via inventoryValueId
  declare activityValues: ActivityValue[];
  declare getActivityValues: Sequelize.HasManyGetAssociationsMixin<ActivityValue>;
  declare setActivityValues: Sequelize.HasManySetAssociationsMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare addActivityValue: Sequelize.HasManyAddAssociationMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare addActivityValues: Sequelize.HasManyAddAssociationsMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare createActivityValue: Sequelize.HasManyCreateAssociationMixin<ActivityValue>;
  declare removeActivityValue: Sequelize.HasManyRemoveAssociationMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare removeActivityValues: Sequelize.HasManyRemoveAssociationsMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare hasActivityValue: Sequelize.HasManyHasAssociationMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare hasActivityValues: Sequelize.HasManyHasAssociationsMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare countActivityValues: Sequelize.HasManyCountAssociationsMixin;

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
        co2eq: {
          type: DataTypes.BIGINT,
          allowNull: true,
        },
        co2eqYears: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "co2eq_years",
        },
        unavailableReason: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "unavailable_reason",
        },
        unavailableExplanation: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "unavailable_explanation",
        },
        inputMethodology: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "input_methodology",
        },
        sectorId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "Sector",
            key: "sector_id",
          },
          field: "sector_id",
        },
        subSectorId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "SubSector",
            key: "subsector_id",
          },
          field: "sub_sector_id",
        },
        subCategoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "SubCategory",
            key: "subcategory_id",
          },
          field: "sub_category_id",
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
        hooks: {
          afterCreate: async (inventoryValue: InventoryValue) => {
            if (inventoryValue.inventoryId) {
              const inventory = await inventoryValue.getInventory();
              if (inventory) {
                await inventory.update({ lastUpdated: new Date() });
              }
            }
          },
          afterUpdate: async (inventoryValue: InventoryValue) => {
            if (inventoryValue.inventoryId) {
              const inventory = await inventoryValue.getInventory();
              if (inventory) {
                await inventory.update({ lastUpdated: new Date() });
              }
            }
          },
          afterDestroy: async (inventoryValue: InventoryValue) => {
            if (inventoryValue.inventoryId) {
              const inventory = await inventoryValue.getInventory();
              if (inventory) {
                await inventory.update({ lastUpdated: new Date() });
              }
            }
          },
        },
      },
    );
  }
}
