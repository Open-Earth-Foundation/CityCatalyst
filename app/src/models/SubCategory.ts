import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { ActivityData, ActivityDataId } from './ActivityData';
import type { DataSource, DataSourceId } from './DataSource';
import type { DataSourceSubCategory, DataSourceSubCategoryId } from './DataSourceSubCategory';
import type { ReportingLevel, ReportingLevelId } from './ReportingLevel';
import type { Scope, ScopeId } from './Scope';
import type { SubCategoryValue, SubCategoryValueId } from './SubCategoryValue';
import type { SubSector, SubSectorId } from './SubSector';

export interface SubCategoryAttributes {
  subcategoryId: string;
  subcategoryName?: string;
  activityName?: string;
  subsectorId?: string;
  scopeId?: string;
  reportinglevelId?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type SubCategoryPk = "subcategoryId";
export type SubCategoryId = SubCategory[SubCategoryPk];
export type SubCategoryOptionalAttributes = "subcategoryName" | "activityName" | "subsectorId" | "scopeId" | "reportinglevelId" | "created" | "lastUpdated";
export type SubCategoryCreationAttributes = Optional<SubCategoryAttributes, SubCategoryOptionalAttributes>;

export class SubCategory extends Model<SubCategoryAttributes, SubCategoryCreationAttributes> implements SubCategoryAttributes {
  subcategoryId!: string;
  subcategoryName?: string;
  activityName?: string;
  subsectorId?: string;
  scopeId?: string;
  reportinglevelId?: string;
  created?: Date;
  lastUpdated?: Date;

  // SubCategory belongsTo ReportingLevel via reportinglevelId
  reportinglevel!: ReportingLevel;
  getReportinglevel!: Sequelize.BelongsToGetAssociationMixin<ReportingLevel>;
  setReportinglevel!: Sequelize.BelongsToSetAssociationMixin<ReportingLevel, ReportingLevelId>;
  createReportinglevel!: Sequelize.BelongsToCreateAssociationMixin<ReportingLevel>;
  // SubCategory belongsTo Scope via scopeId
  scope!: Scope;
  getScope!: Sequelize.BelongsToGetAssociationMixin<Scope>;
  setScope!: Sequelize.BelongsToSetAssociationMixin<Scope, ScopeId>;
  createScope!: Sequelize.BelongsToCreateAssociationMixin<Scope>;
  // SubCategory hasMany ActivityData via subcategoryId
  activityData!: ActivityData[];
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
  // SubCategory belongsToMany DataSource via subcategoryId and datasourceId
  datasourceIdDataSourceDataSourceSubCategories!: DataSource[];
  getDatasourceIdDataSourceDataSourceSubCategories!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasourceIdDataSourceDataSourceSubCategories!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasourceIdDataSourceDataSourceSubCategory!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasourceIdDataSourceDataSourceSubCategories!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasourceIdDataSourceDataSourceSubCategory!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasourceIdDataSourceDataSourceSubCategory!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasourceIdDataSourceDataSourceSubCategories!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasourceIdDataSourceDataSourceSubCategory!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasourceIdDataSourceDataSourceSubCategories!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasourceIdDataSourceDataSourceSubCategories!: Sequelize.BelongsToManyCountAssociationsMixin;
  // SubCategory hasMany DataSourceSubCategory via subcategoryId
  dataSourceSubCategories!: DataSourceSubCategory[];
  getDataSourceSubCategories!: Sequelize.HasManyGetAssociationsMixin<DataSourceSubCategory>;
  setDataSourceSubCategories!: Sequelize.HasManySetAssociationsMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  addDataSourceSubCategory!: Sequelize.HasManyAddAssociationMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  addDataSourceSubCategories!: Sequelize.HasManyAddAssociationsMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  createDataSourceSubCategory!: Sequelize.HasManyCreateAssociationMixin<DataSourceSubCategory>;
  removeDataSourceSubCategory!: Sequelize.HasManyRemoveAssociationMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  removeDataSourceSubCategories!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  hasDataSourceSubCategory!: Sequelize.HasManyHasAssociationMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  hasDataSourceSubCategories!: Sequelize.HasManyHasAssociationsMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  countDataSourceSubCategories!: Sequelize.HasManyCountAssociationsMixin;
  // SubCategory hasMany SubCategoryValue via subcategoryId
  subCategoryValues!: SubCategoryValue[];
  getSubCategoryValues!: Sequelize.HasManyGetAssociationsMixin<SubCategoryValue>;
  setSubCategoryValues!: Sequelize.HasManySetAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  addSubCategoryValue!: Sequelize.HasManyAddAssociationMixin<SubCategoryValue, SubCategoryValueId>;
  addSubCategoryValues!: Sequelize.HasManyAddAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  createSubCategoryValue!: Sequelize.HasManyCreateAssociationMixin<SubCategoryValue>;
  removeSubCategoryValue!: Sequelize.HasManyRemoveAssociationMixin<SubCategoryValue, SubCategoryValueId>;
  removeSubCategoryValues!: Sequelize.HasManyRemoveAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  hasSubCategoryValue!: Sequelize.HasManyHasAssociationMixin<SubCategoryValue, SubCategoryValueId>;
  hasSubCategoryValues!: Sequelize.HasManyHasAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  countSubCategoryValues!: Sequelize.HasManyCountAssociationsMixin;
  // SubCategory belongsTo SubSector via subsectorId
  subsector!: SubSector;
  getSubsector!: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  setSubsector!: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  createSubsector!: Sequelize.BelongsToCreateAssociationMixin<SubSector>;

  static initModel(sequelize: Sequelize.Sequelize): typeof SubCategory {
    return SubCategory.init({
    subcategoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      field: 'subcategory_id'
    },
    subcategoryName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'subcategory_name'
    },
    activityName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'activity_name'
    },
    subsectorId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'SubSector',
        key: 'subsector_id'
      },
      field: 'subsector_id'
    },
    scopeId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Scope',
        key: 'scope_id'
      },
      field: 'scope_id'
    },
    reportinglevelId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'ReportingLevel',
        key: 'reportinglevel_id'
      },
      field: 'reportinglevel_id'
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true
    },
    lastUpdated: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_updated'
    }
  }, {
    sequelize,
    tableName: 'SubCategory',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "SubCategory_pkey",
        unique: true,
        fields: [
          { name: "subcategory_id" },
        ]
      },
    ]
  });
  }
}
