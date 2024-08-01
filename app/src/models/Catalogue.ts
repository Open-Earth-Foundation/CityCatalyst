import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface CatalogueAttributes {
  type?: string;
  lastUpdate?: Date;
}

export type CatalogueOptionalAttributes = "type" | "lastUpdate";
export type CatalogueCreationAttributes = Optional<
  CatalogueAttributes,
  CatalogueOptionalAttributes
>;

export class Catalogue
  extends Model<CatalogueAttributes, CatalogueCreationAttributes>
  implements CatalogueAttributes
{
  type?: string;
  lastUpdate?: Date;

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
      },
      {
        sequelize,
        tableName: "Catalogue",
        schema: "public",
        timestamps: false,
      },
    );
  }
}
