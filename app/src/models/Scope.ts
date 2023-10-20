import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { ActivityData, ActivityDataId } from "./ActivityData";
import type { DataSource, DataSourceId } from "./DataSource";
import type { DataSourceScope, DataSourceScopeId } from "./DataSourceScope";
import type { SubCategory, SubCategoryId } from "./SubCategory";
import type { SubSector, SubSectorId } from "./SubSector";
import type { SubSectorScope, SubSectorScopeId } from "./SubSectorScope";

export interface ScopeAttributes {
  scopeId: string;
  scopeName?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type ScopePk = "scopeId";
export type ScopeId = Scope[ScopePk];
export type ScopeOptionalAttributes = "scopeName" | "created" | "lastUpdated";
export type ScopeCreationAttributes = Optional<
  ScopeAttributes,
  ScopeOptionalAttributes
>;

export class Scope
  extends Model<ScopeAttributes, ScopeCreationAttributes>
  implements ScopeAttributes
{
  scopeId!: string;
  scopeName?: string;
  created?: Date;
  lastUpdated?: Date;

  // Scope hasMany ActivityData via scopeId
  activityData!: ActivityData[];
  getActivityData!: Sequelize.HasManyGetAssociationsMixin<ActivityData>;
  setActivityData!: Sequelize.HasManySetAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  addActivityDatum!: Sequelize.HasManyAddAssociationMixin<
    ActivityData,
    ActivityDataId
  >;
  addActivityData!: Sequelize.HasManyAddAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  createActivityDatum!: Sequelize.HasManyCreateAssociationMixin<ActivityData>;
  removeActivityDatum!: Sequelize.HasManyRemoveAssociationMixin<
    ActivityData,
    ActivityDataId
  >;
  removeActivityData!: Sequelize.HasManyRemoveAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  hasActivityDatum!: Sequelize.HasManyHasAssociationMixin<
    ActivityData,
    ActivityDataId
  >;
  hasActivityData!: Sequelize.HasManyHasAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  countActivityData!: Sequelize.HasManyCountAssociationsMixin;
  // Scope belongsToMany DataSource via scopeId and datasourceId
  datasourceIdDataSourceDataSourceScopes!: DataSource[];
  getDatasourceIdDataSourceDataSourceScopes!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasourceIdDataSourceDataSourceScopes!: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  addDatasourceIdDataSourceDataSourceScope!: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  addDatasourceIdDataSourceDataSourceScopes!: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  createDatasourceIdDataSourceDataSourceScope!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasourceIdDataSourceDataSourceScope!: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  removeDatasourceIdDataSourceDataSourceScopes!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  hasDatasourceIdDataSourceDataSourceScope!: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  hasDatasourceIdDataSourceDataSourceScopes!: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  countDatasourceIdDataSourceDataSourceScopes!: Sequelize.BelongsToManyCountAssociationsMixin;
  // Scope hasMany DataSourceScope via scopeId
  dataSourceScopes!: DataSourceScope[];
  getDataSourceScopes!: Sequelize.HasManyGetAssociationsMixin<DataSourceScope>;
  setDataSourceScopes!: Sequelize.HasManySetAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  addDataSourceScope!: Sequelize.HasManyAddAssociationMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  addDataSourceScopes!: Sequelize.HasManyAddAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  createDataSourceScope!: Sequelize.HasManyCreateAssociationMixin<DataSourceScope>;
  removeDataSourceScope!: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  removeDataSourceScopes!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  hasDataSourceScope!: Sequelize.HasManyHasAssociationMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  hasDataSourceScopes!: Sequelize.HasManyHasAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  countDataSourceScopes!: Sequelize.HasManyCountAssociationsMixin;
  // Scope hasMany SubCategory via scopeId
  subCategories!: SubCategory[];
  getSubCategories!: Sequelize.HasManyGetAssociationsMixin<SubCategory>;
  setSubCategories!: Sequelize.HasManySetAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  addSubCategory!: Sequelize.HasManyAddAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  addSubCategories!: Sequelize.HasManyAddAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  createSubCategory!: Sequelize.HasManyCreateAssociationMixin<SubCategory>;
  removeSubCategory!: Sequelize.HasManyRemoveAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  removeSubCategories!: Sequelize.HasManyRemoveAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  hasSubCategory!: Sequelize.HasManyHasAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  hasSubCategories!: Sequelize.HasManyHasAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  countSubCategories!: Sequelize.HasManyCountAssociationsMixin;
  // Scope belongsToMany SubSector via scopeId and subsectorId
  subsectorIdSubSectorSubSectorScopes!: SubSector[];
  getSubsectorIdSubSectorSubSectorScopes!: Sequelize.BelongsToManyGetAssociationsMixin<SubSector>;
  setSubsectorIdSubSectorSubSectorScopes!: Sequelize.BelongsToManySetAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  addSubsectorIdSubSectorSubSectorScope!: Sequelize.BelongsToManyAddAssociationMixin<
    SubSector,
    SubSectorId
  >;
  addSubsectorIdSubSectorSubSectorScopes!: Sequelize.BelongsToManyAddAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  createSubsectorIdSubSectorSubSectorScope!: Sequelize.BelongsToManyCreateAssociationMixin<SubSector>;
  removeSubsectorIdSubSectorSubSectorScope!: Sequelize.BelongsToManyRemoveAssociationMixin<
    SubSector,
    SubSectorId
  >;
  removeSubsectorIdSubSectorSubSectorScopes!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  hasSubsectorIdSubSectorSubSectorScope!: Sequelize.BelongsToManyHasAssociationMixin<
    SubSector,
    SubSectorId
  >;
  hasSubsectorIdSubSectorSubSectorScopes!: Sequelize.BelongsToManyHasAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  countSubsectorIdSubSectorSubSectorScopes!: Sequelize.BelongsToManyCountAssociationsMixin;
  // Scope hasMany SubSectorScope via scopeId
  subSectorScopes!: SubSectorScope[];
  getSubSectorScopes!: Sequelize.HasManyGetAssociationsMixin<SubSectorScope>;
  setSubSectorScopes!: Sequelize.HasManySetAssociationsMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  addSubSectorScope!: Sequelize.HasManyAddAssociationMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  addSubSectorScopes!: Sequelize.HasManyAddAssociationsMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  createSubSectorScope!: Sequelize.HasManyCreateAssociationMixin<SubSectorScope>;
  removeSubSectorScope!: Sequelize.HasManyRemoveAssociationMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  removeSubSectorScopes!: Sequelize.HasManyRemoveAssociationsMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  hasSubSectorScope!: Sequelize.HasManyHasAssociationMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  hasSubSectorScopes!: Sequelize.HasManyHasAssociationsMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  countSubSectorScopes!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof Scope {
    return Scope.init(
      {
        scopeId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "scope_id",
        },
        scopeName: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "scope_name",
        },
      },
      {
        sequelize,
        tableName: "Scope",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "Scope_pkey",
            unique: true,
            fields: [{ name: "scope_id" }],
          },
        ],
      },
    );
  }
}
