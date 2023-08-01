import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { ActivityData, ActivityDataId } from './ActivityData';
import type { DataSource, DataSourceId } from './DataSource';
import type { DataSourceScope, DataSourceScopeId } from './DataSourceScope';
import type { SubCategory, SubCategoryId } from './SubCategory';
import type { SubSector, SubSectorId } from './SubSector';
import type { SubSectorScope, SubSectorScopeId } from './SubSectorScope';

export interface ScopeAttributes {
  scope_id: string;
  scope_name?: string;
  created?: Date;
  last_updated?: Date;
}

export type ScopePk = "scope_id";
export type ScopeId = Scope[ScopePk];
export type ScopeOptionalAttributes = "scope_name" | "created" | "last_updated";
export type ScopeCreationAttributes = Optional<ScopeAttributes, ScopeOptionalAttributes>;

export class Scope extends Model<ScopeAttributes, ScopeCreationAttributes> implements ScopeAttributes {
  scope_id!: string;
  scope_name?: string;
  created?: Date;
  last_updated?: Date;

  // Scope hasMany ActivityData via scope_id
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
  // Scope belongsToMany DataSource via scope_id and datasource_id
  datasource_id_DataSource_DataSourceScopes!: DataSource[];
  getDatasource_id_DataSource_DataSourceScopes!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasource_id_DataSource_DataSourceScopes!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceScope!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceScopes!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasource_id_DataSource_DataSourceScope!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasource_id_DataSource_DataSourceScope!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasource_id_DataSource_DataSourceScopes!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceScope!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceScopes!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasource_id_DataSource_DataSourceScopes!: Sequelize.BelongsToManyCountAssociationsMixin;
  // Scope hasMany DataSourceScope via scope_id
  DataSourceScopes!: DataSourceScope[];
  getDataSourceScopes!: Sequelize.HasManyGetAssociationsMixin<DataSourceScope>;
  setDataSourceScopes!: Sequelize.HasManySetAssociationsMixin<DataSourceScope, DataSourceScopeId>;
  addDataSourceScope!: Sequelize.HasManyAddAssociationMixin<DataSourceScope, DataSourceScopeId>;
  addDataSourceScopes!: Sequelize.HasManyAddAssociationsMixin<DataSourceScope, DataSourceScopeId>;
  createDataSourceScope!: Sequelize.HasManyCreateAssociationMixin<DataSourceScope>;
  removeDataSourceScope!: Sequelize.HasManyRemoveAssociationMixin<DataSourceScope, DataSourceScopeId>;
  removeDataSourceScopes!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceScope, DataSourceScopeId>;
  hasDataSourceScope!: Sequelize.HasManyHasAssociationMixin<DataSourceScope, DataSourceScopeId>;
  hasDataSourceScopes!: Sequelize.HasManyHasAssociationsMixin<DataSourceScope, DataSourceScopeId>;
  countDataSourceScopes!: Sequelize.HasManyCountAssociationsMixin;
  // Scope hasMany SubCategory via scope_id
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
  // Scope belongsToMany SubSector via scope_id and subsector_id
  subsector_id_SubSector_SubSectorScopes!: SubSector[];
  getSubsector_id_SubSector_SubSectorScopes!: Sequelize.BelongsToManyGetAssociationsMixin<SubSector>;
  setSubsector_id_SubSector_SubSectorScopes!: Sequelize.BelongsToManySetAssociationsMixin<SubSector, SubSectorId>;
  addSubsector_id_SubSector_SubSectorScope!: Sequelize.BelongsToManyAddAssociationMixin<SubSector, SubSectorId>;
  addSubsector_id_SubSector_SubSectorScopes!: Sequelize.BelongsToManyAddAssociationsMixin<SubSector, SubSectorId>;
  createSubsector_id_SubSector_SubSectorScope!: Sequelize.BelongsToManyCreateAssociationMixin<SubSector>;
  removeSubsector_id_SubSector_SubSectorScope!: Sequelize.BelongsToManyRemoveAssociationMixin<SubSector, SubSectorId>;
  removeSubsector_id_SubSector_SubSectorScopes!: Sequelize.BelongsToManyRemoveAssociationsMixin<SubSector, SubSectorId>;
  hasSubsector_id_SubSector_SubSectorScope!: Sequelize.BelongsToManyHasAssociationMixin<SubSector, SubSectorId>;
  hasSubsector_id_SubSector_SubSectorScopes!: Sequelize.BelongsToManyHasAssociationsMixin<SubSector, SubSectorId>;
  countSubsector_id_SubSector_SubSectorScopes!: Sequelize.BelongsToManyCountAssociationsMixin;
  // Scope hasMany SubSectorScope via scope_id
  SubSectorScopes!: SubSectorScope[];
  getSubSectorScopes!: Sequelize.HasManyGetAssociationsMixin<SubSectorScope>;
  setSubSectorScopes!: Sequelize.HasManySetAssociationsMixin<SubSectorScope, SubSectorScopeId>;
  addSubSectorScope!: Sequelize.HasManyAddAssociationMixin<SubSectorScope, SubSectorScopeId>;
  addSubSectorScopes!: Sequelize.HasManyAddAssociationsMixin<SubSectorScope, SubSectorScopeId>;
  createSubSectorScope!: Sequelize.HasManyCreateAssociationMixin<SubSectorScope>;
  removeSubSectorScope!: Sequelize.HasManyRemoveAssociationMixin<SubSectorScope, SubSectorScopeId>;
  removeSubSectorScopes!: Sequelize.HasManyRemoveAssociationsMixin<SubSectorScope, SubSectorScopeId>;
  hasSubSectorScope!: Sequelize.HasManyHasAssociationMixin<SubSectorScope, SubSectorScopeId>;
  hasSubSectorScopes!: Sequelize.HasManyHasAssociationsMixin<SubSectorScope, SubSectorScopeId>;
  countSubSectorScopes!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof Scope {
    return Scope.init({
    scope_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    scope_name: {
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
    tableName: 'Scope',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "Scope_pkey",
        unique: true,
        fields: [
          { name: "scope_id" },
        ]
      },
    ]
  });
  }
}
