import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { City, CityId } from './City';
import type { DataSource, DataSourceId } from './DataSource';

export interface PopulationAttributes {
  city_id: string;
  population?: number;
  year: number;
  created?: Date;
  last_updated?: Date;
  datasource_id?: string;
}

export type PopulationPk = "city_id" | "year";
export type PopulationId = Population[PopulationPk];
export type PopulationOptionalAttributes = "population" | "created" | "last_updated" | "datasource_id";
export type PopulationCreationAttributes = Optional<PopulationAttributes, PopulationOptionalAttributes>;

export class Population extends Model<PopulationAttributes, PopulationCreationAttributes> implements PopulationAttributes {
  city_id!: string;
  population?: number;
  year!: number;
  created?: Date;
  last_updated?: Date;
  datasource_id?: string;

  // Population belongsTo City via city_id
  city!: City;
  getCity!: Sequelize.BelongsToGetAssociationMixin<City>;
  setCity!: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  createCity!: Sequelize.BelongsToCreateAssociationMixin<City>;
  // Population belongsTo DataSource via datasource_id
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;

  static initModel(sequelize: Sequelize.Sequelize): typeof Population {
    return Population.init({
    city_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'City',
        key: 'city_id'
      }
    },
    population: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_updated: {
      type: DataTypes.DATE,
      allowNull: true
    },
    datasource_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'DataSource',
        key: 'datasource_id'
      }
    }
  }, {
    sequelize,
    tableName: 'Population',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "Population_pkey",
        unique: true,
        fields: [
          { name: "city_id" },
          { name: "year" },
        ]
      },
    ]
  });
  }
}
