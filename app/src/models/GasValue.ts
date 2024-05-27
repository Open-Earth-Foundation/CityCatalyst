import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { ActivityValue, ActivityValueId } from "./ActivityValue";
import type { EmissionsFactor, EmissionsFactorId } from "./EmissionsFactor";
import type { InventoryValue, InventoryValueId } from "./InventoryValue";

export interface GasValueAttributes {
  id: string;
  inventoryValueId?: string;
  emissionsFactorId?: string;
  gas?: string;
  gasAmount?: bigint | null;
  activityValueId?: string;
}

export type GasValuePk = "id";
export type GasValueId = GasValue[GasValuePk];
export type GasValueOptionalAttributes =
  | "inventoryValueId"
  | "emissionsFactorId"
  | "gas"
  | "gasAmount"
  | "activityValueId";
export type GasValueCreationAttributes = Optional<
  GasValueAttributes,
  GasValueOptionalAttributes
>;

export class GasValue
  extends Model<GasValueAttributes, GasValueCreationAttributes>
  implements GasValueAttributes {
  id!: string;
  inventoryValueId?: string;
  emissionsFactorId?: string;
  gas?: string;
  gasAmount?: bigint | null;
  activityValueId?: string;

  // GasValue belongsTo ActivityValue via activityValueId
  activityValue!: ActivityValue;
  getActivityValue!: Sequelize.BelongsToGetAssociationMixin<ActivityValue>;
  setActivityValue!: Sequelize.BelongsToSetAssociationMixin<
    ActivityValue,
    ActivityValueId
  >;
  createActivityValue!: Sequelize.BelongsToCreateAssociationMixin<ActivityValue>;
  // GasValue belongsTo EmissionsFactor via emissionsFactorId
  emissionsFactor!: EmissionsFactor;
  getEmissionsFactor!: Sequelize.BelongsToGetAssociationMixin<EmissionsFactor>;
  setEmissionsFactor!: Sequelize.BelongsToSetAssociationMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  createEmissionsFactor!: Sequelize.BelongsToCreateAssociationMixin<EmissionsFactor>;
  // GasValue belongsTo InventoryValue via inventoryValueId
  inventoryValue!: InventoryValue;
  getInventoryValue!: Sequelize.BelongsToGetAssociationMixin<InventoryValue>;
  setInventoryValue!: Sequelize.BelongsToSetAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  createInventoryValue!: Sequelize.BelongsToCreateAssociationMixin<InventoryValue>;

  static initModel(sequelize: Sequelize.Sequelize): typeof GasValue {
    return GasValue.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
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
        emissionsFactorId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "EmissionsFactor",
            key: "id",
          },
          field: "emissions_factor_id",
        },
        gas: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        gasAmount: {
          type: DataTypes.BIGINT,
          allowNull: true,
          field: "gas_amount",
        },
        activityValueId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "ActivityValue",
            key: "id",
          },
          field: "activity_value_id",
        },
      },
      {
        sequelize,
        tableName: "GasValue",
        schema: "public",
        timestamps: false,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "GasValue_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
        ],
      },
    );
  }
}
