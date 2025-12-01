import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { City, CityId } from "./City";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";

export interface GDPAttributes {
  cityId: string;
  gdp?: number;
  year: number;
  created?: Date;
  lastUpdated?: Date;
  datasourceId?: string;
}

export type GDPPk = "cityId" | "year";
export type GDPId = GDP[GDPPk];
export type GDPOptionalAttributes =
  | "gdp"
  | "created"
  | "lastUpdated"
  | "datasourceId";
export type GDPCreationAttributes = Optional<
  GDPAttributes,
  GDPOptionalAttributes
>;

export class GDP
  extends Model<GDPAttributes, GDPCreationAttributes>
  implements Partial<GDPAttributes>
{
  declare cityId: string;
  declare gdp?: number;
  declare year: number;
  declare created?: Date;
  declare lastUpdated?: Date;
  declare datasourceId?: string;

  // GDP belongsTo City via cityId
  declare city: City;
  declare getCity: Sequelize.BelongsToGetAssociationMixin<City>;
  declare setCity: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  declare createCity: Sequelize.BelongsToCreateAssociationMixin<City>;
  // GDP belongsTo DataSource via datasourceId
  declare datasource: DataSource;
  declare getDatasource: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  declare setDatasource: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare createDatasource: Sequelize.BelongsToCreateAssociationMixin<DataSource>;

  static initModel(sequelize: Sequelize.Sequelize): typeof GDP {
    return GDP.init(
      {
        cityId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: "City",
            key: "city_id",
          },
          field: "city_id",
        },
        gdp: {
          type: DataTypes.BIGINT,
          allowNull: true,
        },
        year: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
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
        tableName: "GDP",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "GDP_pkey",
            unique: true,
            fields: [{ name: "city_id" }, { name: "year" }],
          },
        ],
      },
    );
  }
}
