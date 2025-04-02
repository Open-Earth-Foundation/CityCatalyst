import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";
import type { DataSourceGHGs, DataSourceGHGsId } from "./DataSourceGHGs";

export interface GHGsAttributes {
  ghgId: string;
  ghgName?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type GHGsPk = "ghgId";
export type GHGsId = GHGs[GHGsPk];
export type GHGsOptionalAttributes = "ghgName" | "created" | "lastUpdated";
export type GHGsCreationAttributes = Optional<
  GHGsAttributes,
  GHGsOptionalAttributes
>;

export class GHGs
  extends Model<GHGsAttributes, GHGsCreationAttributes>
  implements Partial<GHGsAttributes>
{
  ghgId!: string;
  ghgName?: string;
  created?: Date;
  lastUpdated?: Date;

  // GHGs belongsToMany DataSource via ghgId and datasourceId
  datasourceIdDataSourceDataSourceGhgs!: DataSource[];
  getDatasourceIdDataSourceDataSourceGhgs!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasourceIdDataSourceDataSourceGhgs!: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  addDatasourceIdDataSourceDataSourceGhg!: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  addDatasourceIdDataSourceDataSourceGhgs!: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  createDatasourceIdDataSourceDataSourceGhg!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasourceIdDataSourceDataSourceGhg!: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  removeDatasourceIdDataSourceDataSourceGhgs!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  hasDatasourceIdDataSourceDataSourceGhg!: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  hasDatasourceIdDataSourceDataSourceGhgs!: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  countDatasourceIdDataSourceDataSourceGhgs!: Sequelize.BelongsToManyCountAssociationsMixin;
  // GHGs hasMany DataSourceGHGs via ghgId
  dataSourceGhgs!: DataSourceGHGs[];
  getDataSourceGhgs!: Sequelize.HasManyGetAssociationsMixin<DataSourceGHGs>;
  setDataSourceGhgs!: Sequelize.HasManySetAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  addDataSourceGhg!: Sequelize.HasManyAddAssociationMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  addDataSourceGhgs!: Sequelize.HasManyAddAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  createDataSourceGhg!: Sequelize.HasManyCreateAssociationMixin<DataSourceGHGs>;
  removeDataSourceGhg!: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  removeDataSourceGhgs!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  hasDataSourceGhg!: Sequelize.HasManyHasAssociationMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  hasDataSourceGhgs!: Sequelize.HasManyHasAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  countDataSourceGhgs!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof GHGs {
    return GHGs.init(
      {
        ghgId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "ghg_id",
        },
        ghgName: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "ghg_name",
        },
      },
      {
        sequelize,
        tableName: "GHGs",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "GHGs_pkey",
            unique: true,
            fields: [{ name: "ghg_id" }],
          },
        ],
      },
    );
  }
}
