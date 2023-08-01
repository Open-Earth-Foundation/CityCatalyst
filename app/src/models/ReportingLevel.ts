import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { ActivityData, ActivityDataId } from './ActivityData';
import type { DataSource, DataSourceId } from './DataSource';
import type { DataSourceReportingLevel, DataSourceReportingLevelId } from './DataSourceReportingLevel';
import type { SubCategory, SubCategoryId } from './SubCategory';
import type { SubSector, SubSectorId } from './SubSector';
import type { SubSectorReportingLevel, SubSectorReportingLevelId } from './SubSectorReportingLevel';

export interface ReportingLevelAttributes {
  reportinglevel_id: string;
  reportinglevel_name?: string;
  created?: Date;
  last_updated?: Date;
}

export type ReportingLevelPk = "reportinglevel_id";
export type ReportingLevelId = ReportingLevel[ReportingLevelPk];
export type ReportingLevelOptionalAttributes = "reportinglevel_name" | "created" | "last_updated";
export type ReportingLevelCreationAttributes = Optional<ReportingLevelAttributes, ReportingLevelOptionalAttributes>;

export class ReportingLevel extends Model<ReportingLevelAttributes, ReportingLevelCreationAttributes> implements ReportingLevelAttributes {
  reportinglevel_id!: string;
  reportinglevel_name?: string;
  created?: Date;
  last_updated?: Date;

  // ReportingLevel hasMany ActivityData via reportinglevel_id
  ActivityData!: ActivityData[];
  getActivityData!: Sequelize.HasManyGetAssociationsMixin<ActivityData>;
  setActivityData!: Sequelize.HasManySetAssociationsMixin<ActivityData, ActivityDataId>;
  addActivityDatum!: Sequelize.HasManyAddAssociationMixin<ActivityData, ActivityDataId>;
  addActivityData!: Sequelize.HasManyAddAssociationsMixin<ActivityData, ActivityDataId>;
  createActivityDatum!: Sequelize.HasManyCreateAssociationMixin<ActivityData>;
  removeActivityDatum!: Sequelize.HasManyRemoveAssociationMixin<ActivityData, ActivityDataId>;
  removeActivityData!: Sequelize.HasManyRemoveAssociationsMixin<ActivityData, ActivityDataId>;
  hasActivityDatum!: Sequelize.HasManyHasAssociationMixin<ActivityData, ActivityDataId>;
  hasActivityData!: Sequelize.HasManyHasAssociationsMixin<ActivityData, ActivityDataId>;
  countActivityData!: Sequelize.HasManyCountAssociationsMixin;
  // ReportingLevel belongsToMany DataSource via reportinglevel_id and datasource_id
  datasource_id_DataSource_DataSourceReportingLevels!: DataSource[];
  getDatasource_id_DataSource_DataSourceReportingLevels!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasource_id_DataSource_DataSourceReportingLevels!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceReportingLevel!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceReportingLevels!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasource_id_DataSource_DataSourceReportingLevel!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasource_id_DataSource_DataSourceReportingLevel!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasource_id_DataSource_DataSourceReportingLevels!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceReportingLevel!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceReportingLevels!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasource_id_DataSource_DataSourceReportingLevels!: Sequelize.BelongsToManyCountAssociationsMixin;
  // ReportingLevel hasMany DataSourceReportingLevel via reportinglevel_id
  DataSourceReportingLevels!: DataSourceReportingLevel[];
  getDataSourceReportingLevels!: Sequelize.HasManyGetAssociationsMixin<DataSourceReportingLevel>;
  setDataSourceReportingLevels!: Sequelize.HasManySetAssociationsMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  addDataSourceReportingLevel!: Sequelize.HasManyAddAssociationMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  addDataSourceReportingLevels!: Sequelize.HasManyAddAssociationsMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  createDataSourceReportingLevel!: Sequelize.HasManyCreateAssociationMixin<DataSourceReportingLevel>;
  removeDataSourceReportingLevel!: Sequelize.HasManyRemoveAssociationMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  removeDataSourceReportingLevels!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  hasDataSourceReportingLevel!: Sequelize.HasManyHasAssociationMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  hasDataSourceReportingLevels!: Sequelize.HasManyHasAssociationsMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  countDataSourceReportingLevels!: Sequelize.HasManyCountAssociationsMixin;
  // ReportingLevel hasMany SubCategory via reportinglevel_id
  SubCategories!: SubCategory[];
  getSubCategories!: Sequelize.HasManyGetAssociationsMixin<SubCategory>;
  setSubCategories!: Sequelize.HasManySetAssociationsMixin<SubCategory, SubCategoryId>;
  addSubCategory!: Sequelize.HasManyAddAssociationMixin<SubCategory, SubCategoryId>;
  addSubCategories!: Sequelize.HasManyAddAssociationsMixin<SubCategory, SubCategoryId>;
  createSubCategory!: Sequelize.HasManyCreateAssociationMixin<SubCategory>;
  removeSubCategory!: Sequelize.HasManyRemoveAssociationMixin<SubCategory, SubCategoryId>;
  removeSubCategories!: Sequelize.HasManyRemoveAssociationsMixin<SubCategory, SubCategoryId>;
  hasSubCategory!: Sequelize.HasManyHasAssociationMixin<SubCategory, SubCategoryId>;
  hasSubCategories!: Sequelize.HasManyHasAssociationsMixin<SubCategory, SubCategoryId>;
  countSubCategories!: Sequelize.HasManyCountAssociationsMixin;
  // ReportingLevel belongsToMany SubSector via reportinglevel_id and subsector_id
  subsector_id_SubSector_SubSectorReportingLevels!: SubSector[];
  getSubsector_id_SubSector_SubSectorReportingLevels!: Sequelize.BelongsToManyGetAssociationsMixin<SubSector>;
  setSubsector_id_SubSector_SubSectorReportingLevels!: Sequelize.BelongsToManySetAssociationsMixin<SubSector, SubSectorId>;
  addSubsector_id_SubSector_SubSectorReportingLevel!: Sequelize.BelongsToManyAddAssociationMixin<SubSector, SubSectorId>;
  addSubsector_id_SubSector_SubSectorReportingLevels!: Sequelize.BelongsToManyAddAssociationsMixin<SubSector, SubSectorId>;
  createSubsector_id_SubSector_SubSectorReportingLevel!: Sequelize.BelongsToManyCreateAssociationMixin<SubSector>;
  removeSubsector_id_SubSector_SubSectorReportingLevel!: Sequelize.BelongsToManyRemoveAssociationMixin<SubSector, SubSectorId>;
  removeSubsector_id_SubSector_SubSectorReportingLevels!: Sequelize.BelongsToManyRemoveAssociationsMixin<SubSector, SubSectorId>;
  hasSubsector_id_SubSector_SubSectorReportingLevel!: Sequelize.BelongsToManyHasAssociationMixin<SubSector, SubSectorId>;
  hasSubsector_id_SubSector_SubSectorReportingLevels!: Sequelize.BelongsToManyHasAssociationsMixin<SubSector, SubSectorId>;
  countSubsector_id_SubSector_SubSectorReportingLevels!: Sequelize.BelongsToManyCountAssociationsMixin;
  // ReportingLevel hasMany SubSectorReportingLevel via reportinglevel_id
  SubSectorReportingLevels!: SubSectorReportingLevel[];
  getSubSectorReportingLevels!: Sequelize.HasManyGetAssociationsMixin<SubSectorReportingLevel>;
  setSubSectorReportingLevels!: Sequelize.HasManySetAssociationsMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  addSubSectorReportingLevel!: Sequelize.HasManyAddAssociationMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  addSubSectorReportingLevels!: Sequelize.HasManyAddAssociationsMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  createSubSectorReportingLevel!: Sequelize.HasManyCreateAssociationMixin<SubSectorReportingLevel>;
  removeSubSectorReportingLevel!: Sequelize.HasManyRemoveAssociationMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  removeSubSectorReportingLevels!: Sequelize.HasManyRemoveAssociationsMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  hasSubSectorReportingLevel!: Sequelize.HasManyHasAssociationMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  hasSubSectorReportingLevels!: Sequelize.HasManyHasAssociationsMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  countSubSectorReportingLevels!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof ReportingLevel {
    return ReportingLevel.init({
    reportinglevel_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    reportinglevel_name: {
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
    tableName: 'ReportingLevel',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "ReportingLevel_pkey",
        unique: true,
        fields: [
          { name: "reportinglevel_id" },
        ]
      },
    ]
  });
  }
}
