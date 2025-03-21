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
  activitydataId!: string;
  activitydata?: string;
  subcategoryId?: string;
  scopeId?: string;
  reportinglevelId?: string;
  created?: Date;
  lastUpdated?: Date;

  // ActivityData belongsToMany DataSource via activitydataId and datasourceId
  datasourceIdDataSources!: DataSource[];
  getDatasourceIdDataSources!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasourceIdDataSources!: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  addDatasourceIdDataSource!: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  addDatasourceIdDataSources!: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  createDatasourceIdDataSource!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasourceIdDataSource!: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  removeDatasourceIdDataSources!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  hasDatasourceIdDataSource!: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  hasDatasourceIdDataSources!: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  countDatasourceIdDataSources!: Sequelize.BelongsToManyCountAssociationsMixin;
  // ActivityData hasMany DataSourceActivityData via activitydataId
  dataSourceActivityData!: DataSourceActivityData[];
  getDataSourceActivityData!: Sequelize.HasManyGetAssociationsMixin<DataSourceActivityData>;
  setDataSourceActivityData!: Sequelize.HasManySetAssociationsMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  addDataSourceActivityDatum!: Sequelize.HasManyAddAssociationMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  addDataSourceActivityData!: Sequelize.HasManyAddAssociationsMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  createDataSourceActivityDatum!: Sequelize.HasManyCreateAssociationMixin<DataSourceActivityData>;
  removeDataSourceActivityDatum!: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  removeDataSourceActivityData!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  hasDataSourceActivityDatum!: Sequelize.HasManyHasAssociationMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  hasDataSourceActivityData!: Sequelize.HasManyHasAssociationsMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  countDataSourceActivityData!: Sequelize.HasManyCountAssociationsMixin;
  // ActivityData belongsTo ReportingLevel via reportinglevelId
  reportinglevel!: ReportingLevel;
  getReportinglevel!: Sequelize.BelongsToGetAssociationMixin<ReportingLevel>;
  setReportinglevel!: Sequelize.BelongsToSetAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  createReportinglevel!: Sequelize.BelongsToCreateAssociationMixin<ReportingLevel>;
  // ActivityData belongsTo Scope via scopeId
  scope!: Scope;
  getScope!: Sequelize.BelongsToGetAssociationMixin<Scope>;
  setScope!: Sequelize.BelongsToSetAssociationMixin<Scope, ScopeId>;
  createScope!: Sequelize.BelongsToCreateAssociationMixin<Scope>;
  // ActivityData belongsTo SubCategory via subcategoryId
  subcategory!: SubCategory;
  getSubcategory!: Sequelize.BelongsToGetAssociationMixin<SubCategory>;
  setSubcategory!: Sequelize.BelongsToSetAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  createSubcategory!: Sequelize.BelongsToCreateAssociationMixin<SubCategory>;

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
