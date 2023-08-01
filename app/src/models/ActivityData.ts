import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { DataSourceActivityData, DataSourceActivityDataId } from './DataSourceActivityData';
import type { ReportingLevel, ReportingLevelId } from './ReportingLevel';
import type { Scope, ScopeId } from './Scope';
import type { SubCategory, SubCategoryId } from './SubCategory';

export interface ActivityDataAttributes {
  activitydata_id: string;
  activitydata?: string;
  subcategory_id?: string;
  scope_id?: string;
  reportinglevel_id?: string;
  created?: Date;
  last_updated?: Date;
}

export type ActivityDataPk = "activitydata_id";
export type ActivityDataId = ActivityData[ActivityDataPk];
export type ActivityDataOptionalAttributes = "activitydata" | "subcategory_id" | "scope_id" | "reportinglevel_id" | "created" | "last_updated";
export type ActivityDataCreationAttributes = Optional<ActivityDataAttributes, ActivityDataOptionalAttributes>;

export class ActivityData extends Model<ActivityDataAttributes, ActivityDataCreationAttributes> implements ActivityDataAttributes {
  activitydata_id!: string;
  activitydata?: string;
  subcategory_id?: string;
  scope_id?: string;
  reportinglevel_id?: string;
  created?: Date;
  last_updated?: Date;

  // ActivityData belongsToMany DataSource via activitydata_id and datasource_id
  datasource_id_DataSources!: DataSource[];
  getDatasource_id_DataSources!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasource_id_DataSources!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSources!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasource_id_DataSource!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasource_id_DataSource!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasource_id_DataSources!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSources!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasource_id_DataSources!: Sequelize.BelongsToManyCountAssociationsMixin;
  // ActivityData hasMany DataSourceActivityData via activitydata_id
  DataSourceActivityData!: DataSourceActivityData[];
  getDataSourceActivityData!: Sequelize.HasManyGetAssociationsMixin<DataSourceActivityData>;
  setDataSourceActivityData!: Sequelize.HasManySetAssociationsMixin<DataSourceActivityData, DataSourceActivityDataId>;
  addDataSourceActivityDatum!: Sequelize.HasManyAddAssociationMixin<DataSourceActivityData, DataSourceActivityDataId>;
  addDataSourceActivityData!: Sequelize.HasManyAddAssociationsMixin<DataSourceActivityData, DataSourceActivityDataId>;
  createDataSourceActivityDatum!: Sequelize.HasManyCreateAssociationMixin<DataSourceActivityData>;
  removeDataSourceActivityDatum!: Sequelize.HasManyRemoveAssociationMixin<DataSourceActivityData, DataSourceActivityDataId>;
  removeDataSourceActivityData!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceActivityData, DataSourceActivityDataId>;
  hasDataSourceActivityDatum!: Sequelize.HasManyHasAssociationMixin<DataSourceActivityData, DataSourceActivityDataId>;
  hasDataSourceActivityData!: Sequelize.HasManyHasAssociationsMixin<DataSourceActivityData, DataSourceActivityDataId>;
  countDataSourceActivityData!: Sequelize.HasManyCountAssociationsMixin;
  // ActivityData belongsTo ReportingLevel via reportinglevel_id
  reportinglevel!: ReportingLevel;
  getReportinglevel!: Sequelize.BelongsToGetAssociationMixin<ReportingLevel>;
  setReportinglevel!: Sequelize.BelongsToSetAssociationMixin<ReportingLevel, ReportingLevelId>;
  createReportinglevel!: Sequelize.BelongsToCreateAssociationMixin<ReportingLevel>;
  // ActivityData belongsTo Scope via scope_id
  scope!: Scope;
  getScope!: Sequelize.BelongsToGetAssociationMixin<Scope>;
  setScope!: Sequelize.BelongsToSetAssociationMixin<Scope, ScopeId>;
  createScope!: Sequelize.BelongsToCreateAssociationMixin<Scope>;
  // ActivityData belongsTo SubCategory via subcategory_id
  subcategory!: SubCategory;
  getSubcategory!: Sequelize.BelongsToGetAssociationMixin<SubCategory>;
  setSubcategory!: Sequelize.BelongsToSetAssociationMixin<SubCategory, SubCategoryId>;
  createSubcategory!: Sequelize.BelongsToCreateAssociationMixin<SubCategory>;

  static initModel(sequelize: Sequelize.Sequelize): typeof ActivityData {
    return ActivityData.init({
    activitydata_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    activitydata: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    subcategory_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'SubCategory',
        key: 'subcategory_id'
      }
    },
    scope_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Scope',
        key: 'scope_id'
      }
    },
    reportinglevel_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'ReportingLevel',
        key: 'reportinglevel_id'
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
    tableName: 'ActivityData',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "ActivityData_pkey",
        unique: true,
        fields: [
          { name: "activitydata_id" },
        ]
      },
    ]
  });
  }
}
