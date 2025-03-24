import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { City, CityId } from "./City";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";

export interface PopulationAttributes {
  cityId: string;
  population?: number | null;
  countryPopulation?: number;
  regionPopulation?: number;
  year: number;
  created?: Date;
  lastUpdated?: Date;
  datasourceId?: string;
}

export type PopulationPk = "cityId" | "year";
export type PopulationId = Population[PopulationPk];
export type PopulationOptionalAttributes =
  | "population"
  | "countryPopulation"
  | "regionPopulation"
  | "created"
  | "lastUpdated"
  | "datasourceId";
export type PopulationCreationAttributes = Optional<
  PopulationAttributes,
  PopulationOptionalAttributes
>;

export class Population
  extends Model<PopulationAttributes, PopulationCreationAttributes>
  implements Partial<PopulationAttributes>
{
  cityId!: string;
  population?: number | null;
  countryPopulation?: number;
  regionPopulation?: number;
  year!: number;
  created?: Date;
  lastUpdated?: Date;
  datasourceId?: string;

  // Population belongsTo City via cityId
  city!: City;
  getCity!: Sequelize.BelongsToGetAssociationMixin<City>;
  setCity!: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  createCity!: Sequelize.BelongsToCreateAssociationMixin<City>;
  // Population belongsTo DataSource via datasourceId
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;

  static initModel(sequelize: Sequelize.Sequelize): typeof Population {
    return Population.init(
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
        population: {
          type: DataTypes.BIGINT,
          allowNull: true,
        },
        countryPopulation: {
          type: DataTypes.BIGINT,
          allowNull: true,
          field: "country_population",
        },
        regionPopulation: {
          type: DataTypes.BIGINT,
          allowNull: true,
          field: "region_population",
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
        tableName: "Population",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "Population_pkey",
            unique: true,
            fields: [{ name: "city_id" }, { name: "year" }],
          },
        ],
      },
    );
  }
}
