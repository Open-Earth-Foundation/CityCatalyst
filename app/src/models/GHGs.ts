import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { DataSourceGHGs, DataSourceGHGsId } from './DataSourceGHGs';

export interface GHGsAttributes {
  ghg_id: string;
  ghg_name?: string;
  created?: Date;
  last_updated?: Date;
}

export type GHGsPk = "ghg_id";
export type GHGsId = GHGs[GHGsPk];
export type GHGsOptionalAttributes = "ghg_name" | "created" | "last_updated";
export type GHGsCreationAttributes = Optional<GHGsAttributes, GHGsOptionalAttributes>;

export class GHGs extends Model<GHGsAttributes, GHGsCreationAttributes> implements GHGsAttributes {
  ghg_id!: string;
  ghg_name?: string;
  created?: Date;
  last_updated?: Date;

  // GHGs belongsToMany DataSource via ghg_id and datasource_id
  datasource_id_DataSource_DataSourceGHGs!: DataSource[];
  getDatasource_id_DataSource_DataSourceGHGs!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasource_id_DataSource_DataSourceGHGs!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceGHG!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceGHGs!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasource_id_DataSource_DataSourceGHG!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasource_id_DataSource_DataSourceGHG!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasource_id_DataSource_DataSourceGHGs!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceGHG!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceGHGs!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasource_id_DataSource_DataSourceGHGs!: Sequelize.BelongsToManyCountAssociationsMixin;
  // GHGs hasMany DataSourceGHGs via ghg_id
  DataSourceGHGs!: DataSourceGHGs[];
  getDataSourceGHGs!: Sequelize.HasManyGetAssociationsMixin<DataSourceGHGs>;
  setDataSourceGHGs!: Sequelize.HasManySetAssociationsMixin<DataSourceGHGs, DataSourceGHGsId>;
  addDataSourceGHG!: Sequelize.HasManyAddAssociationMixin<DataSourceGHGs, DataSourceGHGsId>;
  addDataSourceGHGs!: Sequelize.HasManyAddAssociationsMixin<DataSourceGHGs, DataSourceGHGsId>;
  createDataSourceGHG!: Sequelize.HasManyCreateAssociationMixin<DataSourceGHGs>;
  removeDataSourceGHG!: Sequelize.HasManyRemoveAssociationMixin<DataSourceGHGs, DataSourceGHGsId>;
  removeDataSourceGHGs!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceGHGs, DataSourceGHGsId>;
  hasDataSourceGHG!: Sequelize.HasManyHasAssociationMixin<DataSourceGHGs, DataSourceGHGsId>;
  hasDataSourceGHGs!: Sequelize.HasManyHasAssociationsMixin<DataSourceGHGs, DataSourceGHGsId>;
  countDataSourceGHGs!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof GHGs {
    return GHGs.init({
    ghg_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    ghg_name: {
      type: DataTypes.STRING(255),
      allowNull: true
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
    tableName: 'GHGs',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "GHGs_pkey",
        unique: true,
        fields: [
          { name: "ghg_id" },
        ]
      },
    ]
  });
  }
}
