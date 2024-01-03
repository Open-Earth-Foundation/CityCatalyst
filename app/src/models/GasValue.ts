import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { InventoryValue, InventoryValueId } from "./InventoryValue";
import { EmissionsFactor, EmissionsFactorId } from "./EmissionsFactor";

export interface GasValueAttributes {
  id: string;
  inventoryValueId?: string;
  emissionsFactorId?: string;
  gas?: string;
  gasAmount?: bigint;
}

export type GasValuePk = "id";
export type GasValueId = GasValue[GasValuePk];
export type GasValueOptionalAttributes =
  | "inventoryValueId"
  | "emissionsFactorId"
  | "gas"
  | "gasAmount";
export type GasValueCreationAttributes = Optional<
  GasValueAttributes,
  GasValueOptionalAttributes
>;

export class GasValue
  extends Model<GasValueAttributes, GasValueCreationAttributes>
  implements GasValueAttributes
{
  id!: string;
  inventoryValueId?: string;
  emissionsFactorId?: string;
  gas?: string;
  gasAmount?: bigint;

  // GasValue belongsTo InventoryValue via inventoryValueId
  inventoryValue!: InventoryValue;
  getInventoryValue!: Sequelize.BelongsToGetAssociationMixin<InventoryValue>;
  setInventoryValue!: Sequelize.BelongsToSetAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  createInventoryValue!: Sequelize.BelongsToCreateAssociationMixin<InventoryValue>;
  // GasValue belongsTo EmissionsFactor via emissionsFactorId
  emissionsFactor!: EmissionsFactor;
  getEmissionsFactor!: Sequelize.BelongsToGetAssociationMixin<EmissionsFactor>;
  setEmissionsFactor!: Sequelize.BelongsToSetAssociationMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  createEmissionsFactor!: Sequelize.BelongsToCreateAssociationMixin<EmissionsFactor>;

  static initModel(sequelize: Sequelize.Sequelize): typeof GasValue {
    return GasValue.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "id",
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
            key: "emissions_factor_id",
          },
          field: "emissions_factor_id",
        },
      },
      {
        sequelize,
        tableName: "GasValue",
        schema: "public",
        timestamps: true,
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
