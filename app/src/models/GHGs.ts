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
  declare ghgId: string;
  declare ghgName?: string;
  declare created?: Date;
  declare lastUpdated?: Date;

  // GHGs belongsToMany DataSource via ghgId and datasourceId
  declare datasourceIdDataSourceDataSourceGhgs: DataSource[];
  declare getDatasourceIdDataSourceDataSourceGhgs: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  declare setDatasourceIdDataSourceDataSourceGhgs: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare addDatasourceIdDataSourceDataSourceGhg: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare addDatasourceIdDataSourceDataSourceGhgs: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare createDatasourceIdDataSourceDataSourceGhg: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  declare removeDatasourceIdDataSourceDataSourceGhg: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare removeDatasourceIdDataSourceDataSourceGhgs: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDatasourceIdDataSourceDataSourceGhg: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDatasourceIdDataSourceDataSourceGhgs: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare countDatasourceIdDataSourceDataSourceGhgs: Sequelize.BelongsToManyCountAssociationsMixin;
  // GHGs hasMany DataSourceGHGs via ghgId
  declare dataSourceGhgs: DataSourceGHGs[];
  declare getDataSourceGhgs: Sequelize.HasManyGetAssociationsMixin<DataSourceGHGs>;
  declare setDataSourceGhgs: Sequelize.HasManySetAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare addDataSourceGhg: Sequelize.HasManyAddAssociationMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare addDataSourceGhgs: Sequelize.HasManyAddAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare createDataSourceGhg: Sequelize.HasManyCreateAssociationMixin<DataSourceGHGs>;
  declare removeDataSourceGhg: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare removeDataSourceGhgs: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare hasDataSourceGhg: Sequelize.HasManyHasAssociationMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare hasDataSourceGhgs: Sequelize.HasManyHasAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare countDataSourceGhgs: Sequelize.HasManyCountAssociationsMixin;

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
