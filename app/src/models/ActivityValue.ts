import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { GasValue, GasValueId } from "./GasValue";
import type { InventoryValue, InventoryValueId } from "./InventoryValue";

export interface ActivityValueAttributes {
  id: string;
  activityData?: object;
  inventoryValueId?: string;
  datasourceId?: string;
  metadata?: object;
  created?: Date;
  lastUpdated?: Date;
}

export type ActivityValuePk = "id";
export type ActivityValueId = ActivityValue[ActivityValuePk];
export type ActivityValueOptionalAttributes =
  | "activityData"
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
  implements ActivityValueAttributes
{
  id!: string;
  activityData?: object;
  inventoryValueId?: string;
  datasourceId?: string;
  metadata?: object;
  created?: Date;
  lastUpdated?: Date;

  // ActivityValue hasMany GasValue via activityValueId
  gasValues!: GasValue[];
  getGasValues!: Sequelize.HasManyGetAssociationsMixin<GasValue>;
  setGasValues!: Sequelize.HasManySetAssociationsMixin<GasValue, GasValueId>;
  addGasValue!: Sequelize.HasManyAddAssociationMixin<GasValue, GasValueId>;
  addGasValues!: Sequelize.HasManyAddAssociationsMixin<GasValue, GasValueId>;
  createGasValue!: Sequelize.HasManyCreateAssociationMixin<GasValue>;
  removeGasValue!: Sequelize.HasManyRemoveAssociationMixin<
    GasValue,
    GasValueId
  >;
  removeGasValues!: Sequelize.HasManyRemoveAssociationsMixin<
    GasValue,
    GasValueId
  >;
  hasGasValue!: Sequelize.HasManyHasAssociationMixin<GasValue, GasValueId>;
  hasGasValues!: Sequelize.HasManyHasAssociationsMixin<GasValue, GasValueId>;
  countGasValues!: Sequelize.HasManyCountAssociationsMixin;
  // ActivityValue belongsTo InventoryValue via inventoryValueId
  inventoryValue!: InventoryValue;
  getInventoryValue!: Sequelize.BelongsToGetAssociationMixin<InventoryValue>;
  setInventoryValue!: Sequelize.BelongsToSetAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  createInventoryValue!: Sequelize.BelongsToCreateAssociationMixin<InventoryValue>;

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
          field: "activity_data",
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
