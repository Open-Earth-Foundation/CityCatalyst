import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { GasValue, GasValueId } from "./GasValue";
import type { InventoryValue, InventoryValueId } from "./InventoryValue";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";

export interface ActivityValueAttributes {
  id: string;
  activityData?: Record<string, any>;
  co2eq?: bigint;
  co2eqYears?: number;
  inventoryValueId?: string;
  datasourceId?: string;
  metadata?: Record<string, any>;
  created?: Date;
  lastUpdated?: Date;
}

export type ActivityValuePk = "id";
export type ActivityValueId = ActivityValue[ActivityValuePk];
export type ActivityValueOptionalAttributes =
  | "activityData"
  | "co2eq"
  | "co2eqYears"
  | "inventoryValueId"
  | "metadata"
  | "created"
  | "lastUpdated";
export type ActivityValueCreationAttributes = Optional<
  ActivityValueAttributes,
  ActivityValueOptionalAttributes
>;

export class ActivityValue
  extends Model<ActivityValueAttributes, ActivityValueCreationAttributes>
  implements Partial<ActivityValueAttributes>
{
  declare id: string;
  declare activityData?: Record<string, any>;
  declare co2eq?: bigint;
  declare co2eqYears?: number;
  declare inventoryValueId?: string;
  declare datasourceId?: string;
  declare metadata?: Record<string, any>;
  declare created?: Date;
  declare lastUpdated?: Date;

  // ActivityValue hasMany GasValue via activityValueId
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
  // ActivityValue belongsTo InventoryValue via inventoryValueId
  declare inventoryValue: InventoryValue;
  declare getInventoryValue: Sequelize.BelongsToGetAssociationMixin<InventoryValue>;
  declare setInventoryValue: Sequelize.BelongsToSetAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  declare createInventoryValue: Sequelize.BelongsToCreateAssociationMixin<InventoryValue>;
  // ActivityValue belongsTo DataSource via DataSourceId
  declare dataSource: DataSource;
  declare getDataSource: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  declare setDataSource: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare createDataSource: Sequelize.BelongsToCreateAssociationMixin<DataSource>;

  static initModel(sequelize: Sequelize.Sequelize): typeof ActivityValue {
    return ActivityValue.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
        },
        activityData: {
          type: DataTypes.JSONB,
          allowNull: true,
          field: "activity_data_jsonb",
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
        inventoryValueId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "InventoryValue",
            key: "id",
          },
          field: "inventory_value_id",
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
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        // activityDataJsonb: {
        //   type: DataTypes.JSONB,
        //   allowNull: true,
        //   field: "activity_data_jsonb",
        // },
      },
      {
        sequelize,
        tableName: "ActivityValue",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "ActivityValue_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
        ],
      },
    );
  }
}
