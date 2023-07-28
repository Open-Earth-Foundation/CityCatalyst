import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { ActivityData, ActivityDataId } from './ActivityData';
import type { DataSource, DataSourceId } from './DataSource';

export interface DataSourceActivityDataAttributes {
  datasource_id: string;
  activitydata_id: string;
  created?: Date;
  last_updated?: Date;
}

export type DataSourceActivityDataPk = "datasource_id" | "activitydata_id";
export type DataSourceActivityDataId = DataSourceActivityData[DataSourceActivityDataPk];
export type DataSourceActivityDataOptionalAttributes = "created" | "last_updated";
export type DataSourceActivityDataCreationAttributes = Optional<DataSourceActivityDataAttributes, DataSourceActivityDataOptionalAttributes>;

export class DataSourceActivityData extends Model<DataSourceActivityDataAttributes, DataSourceActivityDataCreationAttributes> implements DataSourceActivityDataAttributes {
  datasource_id!: string;
  activitydata_id!: string;
  created?: Date;
  last_updated?: Date;

  // DataSourceActivityData belongsTo ActivityData via activitydata_id
  activitydatum!: ActivityData;
  getActivitydatum!: Sequelize.BelongsToGetAssociationMixin<ActivityData>;
  setActivitydatum!: Sequelize.BelongsToSetAssociationMixin<ActivityData, ActivityDataId>;
  createActivitydatum!: Sequelize.BelongsToCreateAssociationMixin<ActivityData>;
  // DataSourceActivityData belongsTo DataSource via datasource_id
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceActivityData {
    return DataSourceActivityData.init({
    datasource_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'DataSource',
        key: 'datasource_id'
      }
    },
    activitydata_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'ActivityData',
        key: 'activitydata_id'
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
    tableName: 'DataSourceActivityData',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "DataSourceActivityData_pkey",
        unique: true,
        fields: [
          { name: "datasource_id" },
          { name: "activitydata_id" },
        ]
      },
    ]
  });
  }
}
