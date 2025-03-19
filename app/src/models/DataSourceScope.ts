import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";
import type { Scope, ScopeId } from "./Scope";

export interface DataSourceScopeAttributes {
  datasourceId: string;
  scopeId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type DataSourceScopePk = "datasourceId" | "scopeId";
export type DataSourceScopeId = DataSourceScope[DataSourceScopePk];
export type DataSourceScopeOptionalAttributes = "created" | "lastUpdated";
export type DataSourceScopeCreationAttributes = Optional<
  DataSourceScopeAttributes,
  DataSourceScopeOptionalAttributes
>;

export class DataSourceScope
  extends Model<DataSourceScopeAttributes, DataSourceScopeCreationAttributes>
  implements Partial<DataSourceScopeAttributes>
{
  datasourceId!: string;
  scopeId!: string;
  created?: Date;
  lastUpdated?: Date;

  // DataSourceScope belongsTo DataSource via datasourceId
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceScope belongsTo Scope via scopeId
  scope!: Scope;
  getScope!: Sequelize.BelongsToGetAssociationMixin<Scope>;
  setScope!: Sequelize.BelongsToSetAssociationMixin<Scope, ScopeId>;
  createScope!: Sequelize.BelongsToCreateAssociationMixin<Scope>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceScope {
    return DataSourceScope.init(
      {
        datasourceId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: "DataSource",
            key: "datasource_id",
          },
          field: "datasource_id",
        },
        scopeId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: "Scope",
            key: "scope_id",
          },
          field: "scope_id",
        },
      },
      {
        sequelize,
        tableName: "DataSourceScope",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "DataSourceScope_pkey",
            unique: true,
            fields: [{ name: "datasource_id" }, { name: "scope_id" }],
          },
        ],
      },
    );
  }
}
