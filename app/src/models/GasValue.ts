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
  implements Partial<GasValueAttributes>
{
  declare id: string;
  declare inventoryValueId?: string;
  declare emissionsFactorId?: string;
  declare gas?: string;
  declare gasAmount?: bigint | null;
  declare activityValueId?: string;

  // GasValue belongsTo ActivityValue via activityValueId
  declare activityValue: ActivityValue;
  declare getActivityValue: Sequelize.BelongsToGetAssociationMixin<ActivityValue>;
  declare setActivityValue: Sequelize.BelongsToSetAssociationMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare createActivityValue: Sequelize.BelongsToCreateAssociationMixin<ActivityValue>;
  // GasValue belongsTo EmissionsFactor via emissionsFactorId
  declare emissionsFactor: EmissionsFactor;
  declare getEmissionsFactor: Sequelize.BelongsToGetAssociationMixin<EmissionsFactor>;
  declare setEmissionsFactor: Sequelize.BelongsToSetAssociationMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  declare createEmissionsFactor: Sequelize.BelongsToCreateAssociationMixin<EmissionsFactor>;
  // GasValue belongsTo InventoryValue via inventoryValueId
  declare inventoryValue: InventoryValue;
  declare getInventoryValue: Sequelize.BelongsToGetAssociationMixin<InventoryValue>;
  declare setInventoryValue: Sequelize.BelongsToSetAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  declare createInventoryValue: Sequelize.BelongsToCreateAssociationMixin<InventoryValue>;

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
        timestamps: true,
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
