import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { City, CityId } from './City';
import type { DataSource, DataSourceId } from './DataSource';

export interface GDPAttributes {
  city_id: string;
  gdp?: number;
  year: number;
  created?: Date;
  last_updated?: Date;
  datasource_id?: string;
}

export type GDPPk = "city_id" | "year";
export type GDPId = GDP[GDPPk];
export type GDPOptionalAttributes = "gdp" | "created" | "last_updated" | "datasource_id";
export type GDPCreationAttributes = Optional<GDPAttributes, GDPOptionalAttributes>;

export class GDP extends Model<GDPAttributes, GDPCreationAttributes> implements GDPAttributes {
  city_id!: string;
  gdp?: number;
  year!: number;
  created?: Date;
  last_updated?: Date;
  datasource_id?: string;

  // GDP belongsTo City via city_id
  city!: City;
  getCity!: Sequelize.BelongsToGetAssociationMixin<City>;
  setCity!: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  createCity!: Sequelize.BelongsToCreateAssociationMixin<City>;
  // GDP belongsTo DataSource via datasource_id
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;

  static initModel(sequelize: Sequelize.Sequelize): typeof GDP {
    return GDP.init({
    city_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'City',
        key: 'city_id'
      }
    },
    gdp: {
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
    tableName: 'GDP',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "GDP_pkey",
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
