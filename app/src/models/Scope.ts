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
  declare scopeId: string;
  declare scopeName?: string;
  declare created?: Date;
  declare lastUpdated?: Date;

  // Scope hasMany ActivityData via scopeId
  declare activityData: ActivityData[];
  declare getActivityData: Sequelize.HasManyGetAssociationsMixin<ActivityData>;
  declare setActivityData: Sequelize.HasManySetAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  declare addActivityDatum: Sequelize.HasManyAddAssociationMixin<
    ActivityData,
    ActivityDataId
  >;
  declare addActivityData: Sequelize.HasManyAddAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  declare createActivityDatum: Sequelize.HasManyCreateAssociationMixin<ActivityData>;
  declare removeActivityDatum: Sequelize.HasManyRemoveAssociationMixin<
    ActivityData,
    ActivityDataId
  >;
  declare removeActivityData: Sequelize.HasManyRemoveAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  declare hasActivityDatum: Sequelize.HasManyHasAssociationMixin<
    ActivityData,
    ActivityDataId
  >;
  declare hasActivityData: Sequelize.HasManyHasAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  declare countActivityData: Sequelize.HasManyCountAssociationsMixin;
  // Scope belongsToMany DataSource via scopeId and datasourceId
  declare dataSources: DataSource[];
  declare getDataSources: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  declare setDataSources: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare addDataSource: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare addDataSources: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare createDataSource: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  declare removeDataSource: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare removeDataSources: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDataSource: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDataSources: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare countDataSources: Sequelize.BelongsToManyCountAssociationsMixin;
  // Scope hasMany DataSourceScope via scopeId
  declare dataSourceScopes: DataSourceScope[];
  declare getDataSourceScopes: Sequelize.HasManyGetAssociationsMixin<DataSourceScope>;
  declare setDataSourceScopes: Sequelize.HasManySetAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare addDataSourceScope: Sequelize.HasManyAddAssociationMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare addDataSourceScopes: Sequelize.HasManyAddAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare createDataSourceScope: Sequelize.HasManyCreateAssociationMixin<DataSourceScope>;
  declare removeDataSourceScope: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare removeDataSourceScopes: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare hasDataSourceScope: Sequelize.HasManyHasAssociationMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare hasDataSourceScopes: Sequelize.HasManyHasAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare countDataSourceScopes: Sequelize.HasManyCountAssociationsMixin;
  // Scope hasMany SubCategory via scopeId
  declare subCategories: SubCategory[];
  declare getSubCategories: Sequelize.HasManyGetAssociationsMixin<SubCategory>;
  declare setSubCategories: Sequelize.HasManySetAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  declare addSubCategory: Sequelize.HasManyAddAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  declare addSubCategories: Sequelize.HasManyAddAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  declare createSubCategory: Sequelize.HasManyCreateAssociationMixin<SubCategory>;
  declare removeSubCategory: Sequelize.HasManyRemoveAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  declare removeSubCategories: Sequelize.HasManyRemoveAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  declare hasSubCategory: Sequelize.HasManyHasAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  declare hasSubCategories: Sequelize.HasManyHasAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  declare countSubCategories: Sequelize.HasManyCountAssociationsMixin;
  // Scope hasMany SubSector via scopeId and subsectorId
  declare subSectors: SubSector[];
  declare getSubSectors: Sequelize.HasManyGetAssociationsMixin<SubSector>;
  declare setSubSectors: Sequelize.HasManySetAssociationsMixin<SubSector, SubSectorId>;
  declare addSubSector: Sequelize.HasManyAddAssociationMixin<SubSector, SubSectorId>;
  declare addSubSectors: Sequelize.HasManyAddAssociationsMixin<SubSector, SubSectorId>;
  declare createSubSector: Sequelize.HasManyCreateAssociationMixin<SubSector>;
  declare removeSubSector: Sequelize.HasManyRemoveAssociationMixin<
    SubSector,
    SubSectorId
  >;
  declare removeSubSectors: Sequelize.HasManyRemoveAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  declare hasSubSector: Sequelize.HasManyHasAssociationMixin<SubSector, SubSectorId>;
  declare hasSubSectors: Sequelize.HasManyHasAssociationsMixin<SubSector, SubSectorId>;
  declare countSubSectors: Sequelize.HasManyCountAssociationsMixin;

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
