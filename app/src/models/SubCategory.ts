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
  subcategory_id: string;
  subcategory_name?: string;
  activity_name?: string;
  subsector_id?: string;
  scope_id?: string;
  reportinglevel_id?: string;
  created?: Date;
  last_updated?: Date;
}

export type SubCategoryPk = "subcategory_id";
export type SubCategoryId = SubCategory[SubCategoryPk];
export type SubCategoryOptionalAttributes = "subcategory_name" | "activity_name" | "subsector_id" | "scope_id" | "reportinglevel_id" | "created" | "last_updated";
export type SubCategoryCreationAttributes = Optional<SubCategoryAttributes, SubCategoryOptionalAttributes>;

export class SubCategory extends Model<SubCategoryAttributes, SubCategoryCreationAttributes> implements SubCategoryAttributes {
  subcategory_id!: string;
  subcategory_name?: string;
  activity_name?: string;
  subsector_id?: string;
  scope_id?: string;
  reportinglevel_id?: string;
  created?: Date;
  last_updated?: Date;

  // SubCategory belongsTo ReportingLevel via reportinglevel_id
  reportinglevel!: ReportingLevel;
  getReportinglevel!: Sequelize.BelongsToGetAssociationMixin<ReportingLevel>;
  setReportinglevel!: Sequelize.BelongsToSetAssociationMixin<ReportingLevel, ReportingLevelId>;
  createReportinglevel!: Sequelize.BelongsToCreateAssociationMixin<ReportingLevel>;
  // SubCategory belongsTo Scope via scope_id
  scope!: Scope;
  getScope!: Sequelize.BelongsToGetAssociationMixin<Scope>;
  setScope!: Sequelize.BelongsToSetAssociationMixin<Scope, ScopeId>;
  createScope!: Sequelize.BelongsToCreateAssociationMixin<Scope>;
  // SubCategory hasMany ActivityData via subcategory_id
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
  // SubCategory belongsToMany DataSource via subcategory_id and datasource_id
  datasource_id_DataSource_DataSourceSubCategories!: DataSource[];
  getDatasource_id_DataSource_DataSourceSubCategories!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasource_id_DataSource_DataSourceSubCategories!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceSubCategory!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceSubCategories!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasource_id_DataSource_DataSourceSubCategory!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasource_id_DataSource_DataSourceSubCategory!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasource_id_DataSource_DataSourceSubCategories!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceSubCategory!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceSubCategories!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasource_id_DataSource_DataSourceSubCategories!: Sequelize.BelongsToManyCountAssociationsMixin;
  // SubCategory hasMany DataSourceSubCategory via subcategory_id
  DataSourceSubCategories!: DataSourceSubCategory[];
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
  // SubCategory hasMany SubCategoryValue via subcategory_id
  SubCategoryValues!: SubCategoryValue[];
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
  // SubCategory belongsTo SubSector via subsector_id
  subsector!: SubSector;
  getSubsector!: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  setSubsector!: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  createSubsector!: Sequelize.BelongsToCreateAssociationMixin<SubSector>;

  static initModel(sequelize: Sequelize.Sequelize): typeof SubCategory {
    return SubCategory.init({
    subcategory_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    subcategory_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    activity_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    subsector_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'SubSector',
        key: 'subsector_id'
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
