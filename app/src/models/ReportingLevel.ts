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
  declare reportinglevelId: string;
  declare reportinglevelName?: string;
  declare created?: Date;
  declare lastUpdated?: Date;

  // ReportingLevel hasMany ActivityData via reportinglevelId
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
  // ReportingLevel belongsToMany DataSource via reportinglevelId and datasourceId
  declare datasourceIdDataSourceDataSourceReportingLevels: DataSource[];
  declare getDatasourceIdDataSourceDataSourceReportingLevels: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  declare setDatasourceIdDataSourceDataSourceReportingLevels: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare addDatasourceIdDataSourceDataSourceReportingLevel: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare addDatasourceIdDataSourceDataSourceReportingLevels: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare createDatasourceIdDataSourceDataSourceReportingLevel: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  declare removeDatasourceIdDataSourceDataSourceReportingLevel: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare removeDatasourceIdDataSourceDataSourceReportingLevels: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDatasourceIdDataSourceDataSourceReportingLevel: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDatasourceIdDataSourceDataSourceReportingLevels: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare countDatasourceIdDataSourceDataSourceReportingLevels: Sequelize.BelongsToManyCountAssociationsMixin;
  // ReportingLevel hasMany DataSourceReportingLevel via reportinglevelId
  declare dataSourceReportingLevels: DataSourceReportingLevel[];
  declare getDataSourceReportingLevels: Sequelize.HasManyGetAssociationsMixin<DataSourceReportingLevel>;
  declare setDataSourceReportingLevels: Sequelize.HasManySetAssociationsMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  declare addDataSourceReportingLevel: Sequelize.HasManyAddAssociationMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  declare addDataSourceReportingLevels: Sequelize.HasManyAddAssociationsMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  declare createDataSourceReportingLevel: Sequelize.HasManyCreateAssociationMixin<DataSourceReportingLevel>;
  declare removeDataSourceReportingLevel: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  declare removeDataSourceReportingLevels: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  declare hasDataSourceReportingLevel: Sequelize.HasManyHasAssociationMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  declare hasDataSourceReportingLevels: Sequelize.HasManyHasAssociationsMixin<
    DataSourceReportingLevel,
    DataSourceReportingLevelId
  >;
  declare countDataSourceReportingLevels: Sequelize.HasManyCountAssociationsMixin;
  // ReportingLevel hasMany SubCategory via reportinglevelId
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
  // ReportingLevel belongsToMany SubSector via reportinglevelId and subsectorId
  declare subsectorIdSubSectorSubSectorReportingLevels: SubSector[];
  declare getSubsectorIdSubSectorSubSectorReportingLevels: Sequelize.BelongsToManyGetAssociationsMixin<SubSector>;
  declare setSubsectorIdSubSectorSubSectorReportingLevels: Sequelize.BelongsToManySetAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  declare addSubsectorIdSubSectorSubSectorReportingLevel: Sequelize.BelongsToManyAddAssociationMixin<
    SubSector,
    SubSectorId
  >;
  declare addSubsectorIdSubSectorSubSectorReportingLevels: Sequelize.BelongsToManyAddAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  declare createSubsectorIdSubSectorSubSectorReportingLevel: Sequelize.BelongsToManyCreateAssociationMixin<SubSector>;
  declare removeSubsectorIdSubSectorSubSectorReportingLevel: Sequelize.BelongsToManyRemoveAssociationMixin<
    SubSector,
    SubSectorId
  >;
  declare removeSubsectorIdSubSectorSubSectorReportingLevels: Sequelize.BelongsToManyRemoveAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  declare hasSubsectorIdSubSectorSubSectorReportingLevel: Sequelize.BelongsToManyHasAssociationMixin<
    SubSector,
    SubSectorId
  >;
  declare hasSubsectorIdSubSectorSubSectorReportingLevels: Sequelize.BelongsToManyHasAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  declare countSubsectorIdSubSectorSubSectorReportingLevels: Sequelize.BelongsToManyCountAssociationsMixin;
  // ReportingLevel hasMany SubSectorReportingLevel via reportinglevelId
  declare subSectorReportingLevels: SubSectorReportingLevel[];
  declare getSubSectorReportingLevels: Sequelize.HasManyGetAssociationsMixin<SubSectorReportingLevel>;
  declare setSubSectorReportingLevels: Sequelize.HasManySetAssociationsMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  declare addSubSectorReportingLevel: Sequelize.HasManyAddAssociationMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  declare addSubSectorReportingLevels: Sequelize.HasManyAddAssociationsMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  declare createSubSectorReportingLevel: Sequelize.HasManyCreateAssociationMixin<SubSectorReportingLevel>;
  declare removeSubSectorReportingLevel: Sequelize.HasManyRemoveAssociationMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  declare removeSubSectorReportingLevels: Sequelize.HasManyRemoveAssociationsMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  declare hasSubSectorReportingLevel: Sequelize.HasManyHasAssociationMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  declare hasSubSectorReportingLevels: Sequelize.HasManyHasAssociationsMixin<
    SubSectorReportingLevel,
    SubSectorReportingLevelId
  >;
  declare countSubSectorReportingLevels: Sequelize.HasManyCountAssociationsMixin;

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
