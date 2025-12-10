import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";
import type { GHGs, GHGsId } from "./GHGs";

export interface DataSourceGHGsAttributes {
  datasourceId: string;
  ghgId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type DataSourceGHGsPk = "datasourceId" | "ghgId";
export type DataSourceGHGsId = DataSourceGHGs[DataSourceGHGsPk];
export type DataSourceGHGsOptionalAttributes = "created" | "lastUpdated";
export type DataSourceGHGsCreationAttributes = Optional<
  DataSourceGHGsAttributes,
  DataSourceGHGsOptionalAttributes
>;

export class DataSourceGHGs
  extends Model<DataSourceGHGsAttributes, DataSourceGHGsCreationAttributes>
  implements Partial<DataSourceGHGsAttributes>
{
  declare datasourceId: string;
  declare ghgId: string;
  declare created?: Date;
  declare lastUpdated?: Date;

  // DataSourceGHGs belongsTo DataSource via datasourceId
  declare datasource: DataSource;
  declare getDatasource: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  declare setDatasource: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare createDatasource: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceGHGs belongsTo GHGs via ghgId
  declare ghg: GHGs;
  declare getGhg: Sequelize.BelongsToGetAssociationMixin<GHGs>;
  declare setGhg: Sequelize.BelongsToSetAssociationMixin<GHGs, GHGsId>;
  declare createGhg: Sequelize.BelongsToCreateAssociationMixin<GHGs>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceGHGs {
    return DataSourceGHGs.init(
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
        ghgId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: "GHGs",
            key: "ghg_id",
          },
          field: "ghg_id",
        },
      },
      {
        sequelize,
        tableName: "DataSourceGHGs",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "DataSourceGHGs_pkey",
            unique: true,
            fields: [{ name: "datasource_id" }, { name: "ghg_id" }],
          },
        ],
      },
    );
  }
}
