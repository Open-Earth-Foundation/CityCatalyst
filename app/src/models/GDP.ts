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
  cityId!: string;
  gdp?: number;
  year!: number;
  created?: Date;
  lastUpdated?: Date;
  datasourceId?: string;

  // GDP belongsTo City via cityId
  city!: City;
  getCity!: Sequelize.BelongsToGetAssociationMixin<City>;
  setCity!: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  createCity!: Sequelize.BelongsToCreateAssociationMixin<City>;
  // GDP belongsTo DataSource via datasourceId
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;

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
