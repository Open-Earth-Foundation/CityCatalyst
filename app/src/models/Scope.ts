import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { ActivityData, ActivityDataId } from "./ActivityData";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";
import type { DataSourceScope, DataSourceScopeId } from "./DataSourceScope";
import type { SubCategory, SubCategoryId } from "./SubCategory";
import type { SubSector, SubSectorId } from "./SubSector";

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
  implements Partial<ScopeAttributes>
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
  dataSources!: DataSource[];
  getDataSources!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDataSources!: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  addDataSource!: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  addDataSources!: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  createDataSource!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDataSource!: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  removeDataSources!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  hasDataSource!: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  hasDataSources!: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  countDataSources!: Sequelize.BelongsToManyCountAssociationsMixin;
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
  // Scope hasMany SubSector via scopeId and subsectorId
  subSectors!: SubSector[];
  getSubSectors!: Sequelize.HasManyGetAssociationsMixin<SubSector>;
  setSubSectors!: Sequelize.HasManySetAssociationsMixin<SubSector, SubSectorId>;
  addSubSector!: Sequelize.HasManyAddAssociationMixin<SubSector, SubSectorId>;
  addSubSectors!: Sequelize.HasManyAddAssociationsMixin<SubSector, SubSectorId>;
  createSubSector!: Sequelize.HasManyCreateAssociationMixin<SubSector>;
  removeSubSector!: Sequelize.HasManyRemoveAssociationMixin<
    SubSector,
    SubSectorId
  >;
  removeSubSectors!: Sequelize.HasManyRemoveAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  hasSubSector!: Sequelize.HasManyHasAssociationMixin<SubSector, SubSectorId>;
  hasSubSectors!: Sequelize.HasManyHasAssociationsMixin<SubSector, SubSectorId>;
  countSubSectors!: Sequelize.HasManyCountAssociationsMixin;

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
