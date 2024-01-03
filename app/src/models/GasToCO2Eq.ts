import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface GasToCO2EqAttributes {
  gas: string;
  co2eq_per_kg?: number;
  co2eq_years?: number;
}

export type GasToCO2EqPk = "gas";
export type GasToCO2EqId = GasToCO2Eq[GasToCO2EqPk];
export type GasToCO2EqOptionalAttributes = "co2eq_per_kg" | "co2eq_years";
export type GasToCO2EqCreationAttributes = Optional<
  GasToCO2EqAttributes,
  GasToCO2EqOptionalAttributes
>;

export class GasToCO2Eq
  extends Model<GasToCO2EqAttributes, GasToCO2EqCreationAttributes>
  implements GasToCO2EqAttributes
{
  gas!: string;
  co2eq_per_kg?: number;
  co2eq_years?: number;

  static initModel(sequelize: Sequelize.Sequelize): typeof GasToCO2Eq {
    return GasToCO2Eq.init(
      {
        gas: {
          type: DataTypes.STRING(255),
          allowNull: false,
          primaryKey: true,
          references: {
            model: "City",
            key: "city_id",
          },
          field: "city_id",
        },
        co2eq_per_kg: {
          type: DataTypes.FLOAT,
          allowNull: true,
        },
        co2eq_years: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
        },
      },
      {
        sequelize,
        tableName: "GasToCO2Eq",
        schema: "public",
        timestamps: true,
        indexes: [
          {
            name: "GasToCO2Eq_pkey",
            unique: true,
            fields: [{ name: "gas" }],
          },
        ],
      },
    );
  }
}
