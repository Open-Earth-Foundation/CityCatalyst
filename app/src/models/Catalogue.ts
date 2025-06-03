import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface CatalogueAttributes {
  type?: string;
  lastUpdate?: Date;
  createdAt?: Date;
}

export type CatalogueOptionalAttributes = "type" | "lastUpdate";
export type CatalogueCreationAttributes = Optional<
  CatalogueAttributes,
  CatalogueOptionalAttributes
>;

export class Catalogue
  extends Model<CatalogueAttributes, CatalogueCreationAttributes>
  implements Partial<CatalogueAttributes>
{
  type?: string;
  lastUpdate?: Date;
  createdAt?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof Catalogue {
    return Catalogue.init(
      {
        type: {
          type: DataTypes.TEXT,
          allowNull: false,
          primaryKey: true,
        },
        lastUpdate: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "last_update",
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          field: "created"
        },
      },
      {
        sequelize,
        tableName: "Catalogue",
        schema: "public",
        timestamps: true,
        createdAt: "created",
      },
    );
  }
}
