import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { ActivityData, ActivityDataId } from "./ActivityData";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";

export interface DataSourceActivityDataAttributes {
  datasourceId: string;
  activitydataId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type DataSourceActivityDataPk = "datasourceId" | "activitydataId";
export type DataSourceActivityDataId =
  DataSourceActivityData[DataSourceActivityDataPk];
export type DataSourceActivityDataOptionalAttributes =
  | "created"
  | "lastUpdated";
export type DataSourceActivityDataCreationAttributes = Optional<
  DataSourceActivityDataAttributes,
  DataSourceActivityDataOptionalAttributes
>;

export class DataSourceActivityData
  extends Model<
    DataSourceActivityDataAttributes,
    DataSourceActivityDataCreationAttributes
  >
  implements Partial<DataSourceActivityDataAttributes>
{
  datasourceId!: string;
  activitydataId!: string;
  created?: Date;
  lastUpdated?: Date;

  // DataSourceActivityData belongsTo ActivityData via activitydataId
  activitydatum!: ActivityData;
  getActivitydatum!: Sequelize.BelongsToGetAssociationMixin<ActivityData>;
  setActivitydatum!: Sequelize.BelongsToSetAssociationMixin<
    ActivityData,
    ActivityDataId
  >;
  createActivitydatum!: Sequelize.BelongsToCreateAssociationMixin<ActivityData>;
  // DataSourceActivityData belongsTo DataSource via datasourceId
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;

  static initModel(
    sequelize: Sequelize.Sequelize,
  ): typeof DataSourceActivityData {
    return DataSourceActivityData.init(
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
        activitydataId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: "ActivityData",
            key: "activitydata_id",
          },
          field: "activitydata_id",
        },
      },
      {
        sequelize,
        tableName: "DataSourceActivityData",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "DataSourceActivityData_pkey",
            unique: true,
            fields: [{ name: "datasource_id" }, { name: "activitydata_id" }],
          },
        ],
      },
    );
  }
}
