import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";
import type {
  DataSourceActivityData,
  DataSourceActivityDataId,
} from "./DataSourceActivityData";
import type { ReportingLevel, ReportingLevelId } from "./ReportingLevel";
import type { Scope, ScopeId } from "./Scope";
import type { SubCategory, SubCategoryId } from "./SubCategory";

export interface ActivityDataAttributes {
  activitydataId: string;
  activitydata?: string;
  subcategoryId?: string;
  scopeId?: string;
  reportinglevelId?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type ActivityDataPk = "activitydataId";
export type ActivityDataId = ActivityData[ActivityDataPk];
export type ActivityDataOptionalAttributes =
  | "activitydata"
  | "subcategoryId"
  | "scopeId"
  | "reportinglevelId"
  | "created"
  | "lastUpdated";
export type ActivityDataCreationAttributes = Optional<
  ActivityDataAttributes,
  ActivityDataOptionalAttributes
>;

export class ActivityData
  extends Model<ActivityDataAttributes, ActivityDataCreationAttributes>
  implements Partial<ActivityDataAttributes>
{
  declare activitydataId: string;
  declare activitydata?: string;
  declare subcategoryId?: string;
  declare scopeId?: string;
  declare reportinglevelId?: string;
  declare created?: Date;
  declare lastUpdated?: Date;

  // ActivityData belongsToMany DataSource via activitydataId and datasourceId
  declare datasourceIdDataSources: DataSource[];
  declare getDatasourceIdDataSources: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  declare setDatasourceIdDataSources: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare addDatasourceIdDataSource: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare addDatasourceIdDataSources: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare createDatasourceIdDataSource: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  declare removeDatasourceIdDataSource: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare removeDatasourceIdDataSources: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDatasourceIdDataSource: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDatasourceIdDataSources: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare countDatasourceIdDataSources: Sequelize.BelongsToManyCountAssociationsMixin;
  // ActivityData hasMany DataSourceActivityData via activitydataId
  declare dataSourceActivityData: DataSourceActivityData[];
  declare getDataSourceActivityData: Sequelize.HasManyGetAssociationsMixin<DataSourceActivityData>;
  declare setDataSourceActivityData: Sequelize.HasManySetAssociationsMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare addDataSourceActivityDatum: Sequelize.HasManyAddAssociationMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare addDataSourceActivityData: Sequelize.HasManyAddAssociationsMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare createDataSourceActivityDatum: Sequelize.HasManyCreateAssociationMixin<DataSourceActivityData>;
  declare removeDataSourceActivityDatum: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare removeDataSourceActivityData: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare hasDataSourceActivityDatum: Sequelize.HasManyHasAssociationMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare hasDataSourceActivityData: Sequelize.HasManyHasAssociationsMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare countDataSourceActivityData: Sequelize.HasManyCountAssociationsMixin;
  // ActivityData belongsTo ReportingLevel via reportinglevelId
  declare reportinglevel: ReportingLevel;
  declare getReportinglevel: Sequelize.BelongsToGetAssociationMixin<ReportingLevel>;
  declare setReportinglevel: Sequelize.BelongsToSetAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare createReportinglevel: Sequelize.BelongsToCreateAssociationMixin<ReportingLevel>;
  // ActivityData belongsTo Scope via scopeId
  declare scope: Scope;
  declare getScope: Sequelize.BelongsToGetAssociationMixin<Scope>;
  declare setScope: Sequelize.BelongsToSetAssociationMixin<Scope, ScopeId>;
  declare createScope: Sequelize.BelongsToCreateAssociationMixin<Scope>;
  // ActivityData belongsTo SubCategory via subcategoryId
  declare subcategory: SubCategory;
  declare getSubcategory: Sequelize.BelongsToGetAssociationMixin<SubCategory>;
  declare setSubcategory: Sequelize.BelongsToSetAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  declare createSubcategory: Sequelize.BelongsToCreateAssociationMixin<SubCategory>;

  static initModel(sequelize: Sequelize.Sequelize): typeof ActivityData {
    return ActivityData.init(
      {
        activitydataId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "activitydata_id",
        },
        activitydata: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        subcategoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "SubCategory",
            key: "subcategory_id",
          },
          field: "subcategory_id",
        },
        scopeId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "Scope",
            key: "scope_id",
          },
          field: "scope_id",
        },
        reportinglevelId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "ReportingLevel",
            key: "reportinglevel_id",
          },
          field: "reportinglevel_id",
        },
      },
      {
        sequelize,
        tableName: "ActivityData",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "ActivityData_pkey",
            unique: true,
            fields: [{ name: "activitydata_id" }],
          },
        ],
      },
    );
  }
}
