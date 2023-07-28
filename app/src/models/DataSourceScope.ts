import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { Scope, ScopeId } from './Scope';

export interface DataSourceScopeAttributes {
  datasource_id: string;
  scope_id: string;
  created?: Date;
  last_updated?: Date;
}

export type DataSourceScopePk = "datasource_id" | "scope_id";
export type DataSourceScopeId = DataSourceScope[DataSourceScopePk];
export type DataSourceScopeOptionalAttributes = "created" | "last_updated";
export type DataSourceScopeCreationAttributes = Optional<DataSourceScopeAttributes, DataSourceScopeOptionalAttributes>;

export class DataSourceScope extends Model<DataSourceScopeAttributes, DataSourceScopeCreationAttributes> implements DataSourceScopeAttributes {
  datasource_id!: string;
  scope_id!: string;
  created?: Date;
  last_updated?: Date;

  // DataSourceScope belongsTo DataSource via datasource_id
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceScope belongsTo Scope via scope_id
  scope!: Scope;
  getScope!: Sequelize.BelongsToGetAssociationMixin<Scope>;
  setScope!: Sequelize.BelongsToSetAssociationMixin<Scope, ScopeId>;
  createScope!: Sequelize.BelongsToCreateAssociationMixin<Scope>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceScope {
    return DataSourceScope.init({
    datasource_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'DataSource',
        key: 'datasource_id'
      }
    },
    scope_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'Scope',
        key: 'scope_id'
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
    tableName: 'DataSourceScope',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "DataSourceScope_pkey",
        unique: true,
        fields: [
          { name: "datasource_id" },
          { name: "scope_id" },
        ]
      },
    ]
  });
  }
}
