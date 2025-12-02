import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { ActivityData, ActivityDataId } from "./ActivityData";
import type {
  DataSourceI18n as DataSource,
  DataSourceI18n as DataSourceId,
} from "./DataSourceI18n";
import type { ReportingLevel, ReportingLevelId } from "./ReportingLevel";
import type { Scope, ScopeId } from "./Scope";
import type { InventoryValue, InventoryValueId } from "./InventoryValue";
import type { SubSector, SubSectorId } from "./SubSector";

export interface SubCategoryAttributes {
  subcategoryId: string;
  subcategoryName?: string;
  /** @deprecated never used and this would need to be an array since one subcategory can have multiple activities */
  activityName?: string; // TODO remove
  referenceNumber?: string;
  subsectorId?: string;
  scopeId?: string;
  reportinglevelId?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type SubCategoryPk = "subcategoryId";
export type SubCategoryId = SubCategory[SubCategoryPk];
export type SubCategoryOptionalAttributes =
  | "subcategoryName"
  | "activityName"
  | "referenceNumber"
  | "subsectorId"
  | "scopeId"
  | "reportinglevelId"
  | "created"
  | "lastUpdated";
export type SubCategoryCreationAttributes = Optional<
  SubCategoryAttributes,
  SubCategoryOptionalAttributes
>;

export class SubCategory
  extends Model<SubCategoryAttributes, SubCategoryCreationAttributes>
  implements Partial<SubCategoryAttributes>
{
  declare subcategoryId: string;
  declare subcategoryName?: string;
  declare activityName?: string;
  declare referenceNumber?: string;
  declare subsectorId?: string;
  declare scopeId?: string;
  declare reportinglevelId?: string;
  declare created?: Date;
  declare lastUpdated?: Date;

  // SubCategory belongsTo ReportingLevel via reportinglevelId
  declare reportinglevel: ReportingLevel;
  declare getReportinglevel: Sequelize.BelongsToGetAssociationMixin<ReportingLevel>;
  declare setReportinglevel: Sequelize.BelongsToSetAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare createReportinglevel: Sequelize.BelongsToCreateAssociationMixin<ReportingLevel>;
  // SubCategory belongsTo Scope via scopeId
  declare scope: Scope;
  declare getScope: Sequelize.BelongsToGetAssociationMixin<Scope>;
  declare setScope: Sequelize.BelongsToSetAssociationMixin<Scope, ScopeId>;
  declare createScope: Sequelize.BelongsToCreateAssociationMixin<Scope>;
  // SubCategory hasMany ActivityData via subcategoryId
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
  // SubCategory hasMany DataSource via subcategoryId
  declare dataSources: DataSource[];
  declare getDataSources: Sequelize.HasManyGetAssociationsMixin<DataSource>;
  declare setDataSources: Sequelize.HasManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare addDataSource: Sequelize.HasManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare addDataSources: Sequelize.HasManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare createDataSource: Sequelize.HasManyCreateAssociationMixin<DataSource>;
  declare removeDataSource: Sequelize.HasManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare removeDataSources: Sequelize.HasManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDataSource: Sequelize.HasManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDataSources: Sequelize.HasManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare countDataSources: Sequelize.HasManyCountAssociationsMixin;
  // SubCategory hasMany InventoryValue via subcategoryId
  declare inventoryValues: InventoryValue[];
  declare getInventoryValues: Sequelize.HasManyGetAssociationsMixin<InventoryValue>;
  declare setInventoryValues: Sequelize.HasManySetAssociationsMixin<
    InventoryValue,
    InventoryValueId
  >;
  declare addInventoryValue: Sequelize.HasManyAddAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  declare addInventoryValues: Sequelize.HasManyAddAssociationsMixin<
    InventoryValue,
    InventoryValueId
  >;
  declare createInventoryValue: Sequelize.HasManyCreateAssociationMixin<InventoryValue>;
  declare removeInventoryValue: Sequelize.HasManyRemoveAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  declare removeInventoryValues: Sequelize.HasManyRemoveAssociationsMixin<
    InventoryValue,
    InventoryValueId
  >;
  declare hasInventoryValue: Sequelize.HasManyHasAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  declare hasInventoryValues: Sequelize.HasManyHasAssociationsMixin<
    InventoryValue,
    InventoryValueId
  >;
  declare countInventoryValues: Sequelize.HasManyCountAssociationsMixin;
  // SubCategory belongsTo SubSector via subsectorId
  declare subsector: SubSector;
  declare getSubsector: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  declare setSubsector: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  declare createSubsector: Sequelize.BelongsToCreateAssociationMixin<SubSector>;

  static initModel(sequelize: Sequelize.Sequelize): typeof SubCategory {
    return SubCategory.init(
      {
        subcategoryId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "subcategory_id",
        },
        subcategoryName: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "subcategory_name",
        },
        activityName: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "activity_name",
        },
        referenceNumber: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "reference_number",
        },
        subsectorId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "SubSector",
            key: "subsector_id",
          },
          field: "subsector_id",
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
        tableName: "SubCategory",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "SubCategory_pkey",
            unique: true,
            fields: [{ name: "subcategory_id" }],
          },
        ],
      },
    );
  }
}
