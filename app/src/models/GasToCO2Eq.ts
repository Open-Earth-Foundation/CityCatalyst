import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { GlobalWarmingPotentialTypeEnum } from "@/util/enums";

export interface GasToCO2EqAttributes {
  gas: string;
  gwpVersion: GlobalWarmingPotentialTypeEnum;
  co2eqPerKg?: number;
  co2eqYears?: number;
}

export type GasToCO2EqPk = "gas" | "gwpVersion";
export type GasToCO2EqId = GasToCO2Eq[GasToCO2EqPk];
export type GasToCO2EqOptionalAttributes = "co2eqPerKg" | "co2eqYears";
export type GasToCO2EqCreationAttributes = Optional<
  GasToCO2EqAttributes,
  GasToCO2EqOptionalAttributes
>;

export class GasToCO2Eq
  extends Model<GasToCO2EqAttributes, GasToCO2EqCreationAttributes>
  implements Partial<GasToCO2EqAttributes>
{
  declare gas: string;
  declare gwpVersion: GlobalWarmingPotentialTypeEnum;
  declare co2eqPerKg?: number;
  declare co2eqYears?: number;

  static initModel(sequelize: Sequelize.Sequelize): typeof GasToCO2Eq {
    return GasToCO2Eq.init(
      {
        gas: {
          type: DataTypes.STRING(255),
          allowNull: false,
          primaryKey: true,
        },
        gwpVersion: {
          type: DataTypes.STRING(16),
          allowNull: false,
          primaryKey: true,
          field: "gwp_version",
        },
        co2eqPerKg: {
          type: DataTypes.FLOAT,
          allowNull: true,
          field: "co2eq_per_kg",
        },
        co2eqYears: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "co2eq_years",
        },
      },
      {
        sequelize,
        tableName: "GasToCO2Eq",
        schema: "public",
        timestamps: false,
        indexes: [
          {
            name: "GasToCO2Eq_pkey",
            unique: true,
            fields: [{ name: "gas" }, { name: "gwp_version" }],
          },
        ],
      },
    );
  }
}
