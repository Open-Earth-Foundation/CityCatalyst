import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { GHGs, GHGsId } from './GHGs';

export interface DataSourceGHGsAttributes {
  datasource_id: string;
  ghg_id: string;
  created?: Date;
  last_updated?: Date;
}

export type DataSourceGHGsPk = "datasource_id" | "ghg_id";
export type DataSourceGHGsId = DataSourceGHGs[DataSourceGHGsPk];
export type DataSourceGHGsOptionalAttributes = "created" | "last_updated";
export type DataSourceGHGsCreationAttributes = Optional<DataSourceGHGsAttributes, DataSourceGHGsOptionalAttributes>;

export class DataSourceGHGs extends Model<DataSourceGHGsAttributes, DataSourceGHGsCreationAttributes> implements DataSourceGHGsAttributes {
  datasource_id!: string;
  ghg_id!: string;
  created?: Date;
  last_updated?: Date;

  // DataSourceGHGs belongsTo DataSource via datasource_id
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceGHGs belongsTo GHGs via ghg_id
  ghg!: GHGs;
  getGhg!: Sequelize.BelongsToGetAssociationMixin<GHGs>;
  setGhg!: Sequelize.BelongsToSetAssociationMixin<GHGs, GHGsId>;
  createGhg!: Sequelize.BelongsToCreateAssociationMixin<GHGs>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceGHGs {
    return DataSourceGHGs.init({
    datasource_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'DataSource',
        key: 'datasource_id'
      }
    },
    ghg_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'GHGs',
        key: 'ghg_id'
      }
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_updated: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'DataSourceGHGs',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "DataSourceGHGs_pkey",
        unique: true,
        fields: [
          { name: "datasource_id" },
          { name: "ghg_id" },
        ]
      },
    ]
  });
  }
}
