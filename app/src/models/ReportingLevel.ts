import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { ActivityData, ActivityDataId } from "./ActivityData";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";
import type {
  DataSourceReportingLevel,
  DataSourceReportingLevelId,
} from "./DataSourceReportingLevel";
import type { SubCategory, SubCategoryId } from "./SubCategory";
import type { SubSector, SubSectorId } from "./SubSector";
import type {
  SubSectorReportingLevel,
  SubSectorReportingLevelId,
} from "./SubSectorReportingLevel";

export interface ReportingLevelAttributes {
  reportinglevelId: string;
  reportinglevelName?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type ReportingLevelPk = "reportinglevelId";
export type ReportingLevelId = ReportingLevel[ReportingLevelPk];
export type ReportingLevelOptionalAttributes =
  | "reportinglevelName"
  | "created"
  | "lastUpdated";
export type ReportingLevelCreationAttributes = Optional<
  ReportingLevelAttributes,
  ReportingLevelOptionalAttributes
>;

export class ReportingLevel
  extends Model<ReportingLevelAttributes, ReportingLevelCreationAttributes>
  implements Partial<ReportingLevelAttributes>
{
  reportinglevelId!: string;
  reportinglevelName?: string;
  created?: Date;
  lastUpdated?: Date;

  // ReportingLevel hasMany ActivityData via reportinglevelId
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
  // ReportingLevel belongsToMany DataSource via reportinglevelId and datasourceId
  datasourceIdDataSourceDataSourceReportingLevels!: DataSource[];
  getDatasourceIdDataSourceDataSourceReportingLevels!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasourceIdDataSourceDataSourceReportingLevels!: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  addDatasourceIdDataSourceDataSourceReportingLevel!: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  addDatasourceIdDataSourceDataSourceReportingLevels!: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  createDatasourceIdDataSourceDataSourceReportingLevel!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasourceIdDataSourceDataSourceReportingLevel!: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  removeDatasourceIdDataSourceDataSourceReportingLevels!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  hasDatasourceIdDataSourceDataSourceReportingLevel!: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  hasDatasourceIdDataSourceDataSourceReportingLevels!: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  countDatasourceIdDataSourceDataSourceReportingLevels!: Sequelize.BelongsToManyCountAssociationsMixin;
  // ReportingLevel hasMany DataSourceReportingLevel via reportinglevelId
  dataSourceReportingLevels!: DataSourceReportingLevel[];
  getDataSourceReportingLevels!: Sequelize.HasManyGetAssociationsMixin<DataSourceReportingLevel>;
  setDataSourceReportingLevels!: Sequelize.HasManySetAssociationsMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  addDataSourceReportingLevel!: Sequelize.HasManyAddAssociationMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  addDataSourceReportingLevels!: Sequelize.HasManyAddAssociationsMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  createDataSourceReportingLevel!: Sequelize.HasManyCreateAssociationMixin<DataSourceReportingLevel>;
  removeDataSourceReportingLevel!: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  removeDataSourceReportingLevels!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  hasDataSourceReportingLevel!: Sequelize.HasManyHasAssociationMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  hasDataSourceReportingLevels!: Sequelize.HasManyHasAssociationsMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  countDataSourceReportingLevels!: Sequelize.HasManyCountAssociationsMixin;
  // ReportingLevel hasMany SubCategory via reportinglevelId
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
  // ReportingLevel belongsToMany SubSector via reportinglevelId and subsectorId
  subsectorIdSubSectorSubSectorReportingLevels!: SubSector[];
  getSubsectorIdSubSectorSubSectorReportingLevels!: Sequelize.BelongsToManyGetAssociationsMixin<SubSector>;
  setSubsectorIdSubSectorSubSectorReportingLevels!: Sequelize.BelongsToManySetAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  addSubsectorIdSubSectorSubSectorReportingLevel!: Sequelize.BelongsToManyAddAssociationMixin<
    SubSector,
    SubSectorId
  >;
  addSubsectorIdSubSectorSubSectorReportingLevels!: Sequelize.BelongsToManyAddAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  createSubsectorIdSubSectorSubSectorReportingLevel!: Sequelize.BelongsToManyCreateAssociationMixin<SubSector>;
  removeSubsectorIdSubSectorSubSectorReportingLevel!: Sequelize.BelongsToManyRemoveAssociationMixin<
    SubSector,
    SubSectorId
  >;
  removeSubsectorIdSubSectorSubSectorReportingLevels!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  hasSubsectorIdSubSectorSubSectorReportingLevel!: Sequelize.BelongsToManyHasAssociationMixin<
    SubSector,
    SubSectorId
  >;
  hasSubsectorIdSubSectorSubSectorReportingLevels!: Sequelize.BelongsToManyHasAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  countSubsectorIdSubSectorSubSectorReportingLevels!: Sequelize.BelongsToManyCountAssociationsMixin;
  // ReportingLevel hasMany SubSectorReportingLevel via reportinglevelId
  subSectorReportingLevels!: SubSectorReportingLevel[];
  getSubSectorReportingLevels!: Sequelize.HasManyGetAssociationsMixin<SubSectorReportingLevel>;
  setSubSectorReportingLevels!: Sequelize.HasManySetAssociationsMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  addSubSectorReportingLevel!: Sequelize.HasManyAddAssociationMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  addSubSectorReportingLevels!: Sequelize.HasManyAddAssociationsMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  createSubSectorReportingLevel!: Sequelize.HasManyCreateAssociationMixin<SubSectorReportingLevel>;
  removeSubSectorReportingLevel!: Sequelize.HasManyRemoveAssociationMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  removeSubSectorReportingLevels!: Sequelize.HasManyRemoveAssociationsMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  hasSubSectorReportingLevel!: Sequelize.HasManyHasAssociationMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  hasSubSectorReportingLevels!: Sequelize.HasManyHasAssociationsMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  countSubSectorReportingLevels!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof ReportingLevel {
    return ReportingLevel.init(
      {
        reportinglevelId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "reportinglevel_id",
        },
        reportinglevelName: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "reportinglevel_name",
        },
      },
      {
        sequelize,
        tableName: "ReportingLevel",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "ReportingLevel_pkey",
            unique: true,
            fields: [{ name: "reportinglevel_id" }],
          },
        ],
      },
    );
  }
}
