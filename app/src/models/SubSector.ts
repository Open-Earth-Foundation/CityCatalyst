import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type {
  DataSourceI18n as DataSource,
  DataSourceI18n as DataSourceId,
} from "./DataSourceI18n";
import type { InventoryValue, InventoryValueId } from "./InventoryValue";
import type { ReportingLevel, ReportingLevelId } from "./ReportingLevel";
import type { Scope, ScopeId } from "./Scope";
import type { Sector, SectorId } from "./Sector";
import type { SubCategory, SubCategoryId } from "./SubCategory";
import type {
  SubSectorReportingLevel,
  SubSectorReportingLevelId,
} from "./SubSectorReportingLevel";

export interface SubSectorAttributes {
  subsectorId: string;
  subsectorName?: string;
  sectorId?: string;
  created?: Date;
  lastUpdated?: Date;
  referenceNumber?: string;
  scopeId?: string;
}

export type SubSectorPk = "subsectorId";
export type SubSectorId = SubSector[SubSectorPk];
export type SubSectorOptionalAttributes =
  | "subsectorName"
  | "sectorId"
  | "created"
  | "lastUpdated"
  | "referenceNumber"
  | "scopeId";
export type SubSectorCreationAttributes = Optional<
  SubSectorAttributes,
  SubSectorOptionalAttributes
>;

export class SubSector
  extends Model<SubSectorAttributes, SubSectorCreationAttributes>
  implements Partial<SubSectorAttributes>
{
  declare subsectorId: string;
  declare subsectorName?: string;
  declare sectorId?: string;
  declare created?: Date;
  declare lastUpdated?: Date;
  declare referenceNumber?: string;
  declare scopeId?: string;

  // SubSector belongsTo Scope via scopeId
  declare scope: Scope;
  declare getScope: Sequelize.BelongsToGetAssociationMixin<Scope>;
  declare setScope: Sequelize.BelongsToSetAssociationMixin<Scope, ScopeId>;
  declare createScope: Sequelize.BelongsToCreateAssociationMixin<Scope>;
  // SubSector belongsTo Sector via sectorId
  declare sector: Sector;
  declare getSector: Sequelize.BelongsToGetAssociationMixin<Sector>;
  declare setSector: Sequelize.BelongsToSetAssociationMixin<Sector, SectorId>;
  declare createSector: Sequelize.BelongsToCreateAssociationMixin<Sector>;
  // SubSector hasMany DataSource via subsectorId
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
  // SubSector hasMany InventoryValue via subSectorId
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
  // SubSector belongsToMany ReportingLevel via subsectorId and reportinglevelId
  declare reportinglevelIdReportingLevelSubSectorReportingLevels: ReportingLevel[];
  declare getReportinglevelIdReportingLevelSubSectorReportingLevels: Sequelize.BelongsToManyGetAssociationsMixin<ReportingLevel>;
  declare setReportinglevelIdReportingLevelSubSectorReportingLevels: Sequelize.BelongsToManySetAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare addReportinglevelIdReportingLevelSubSectorReportingLevel: Sequelize.BelongsToManyAddAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare addReportinglevelIdReportingLevelSubSectorReportingLevels: Sequelize.BelongsToManyAddAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare createReportinglevelIdReportingLevelSubSectorReportingLevel: Sequelize.BelongsToManyCreateAssociationMixin<ReportingLevel>;
  declare removeReportinglevelIdReportingLevelSubSectorReportingLevel: Sequelize.BelongsToManyRemoveAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare removeReportinglevelIdReportingLevelSubSectorReportingLevels: Sequelize.BelongsToManyRemoveAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare hasReportinglevelIdReportingLevelSubSectorReportingLevel: Sequelize.BelongsToManyHasAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare hasReportinglevelIdReportingLevelSubSectorReportingLevels: Sequelize.BelongsToManyHasAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare countReportinglevelIdReportingLevelSubSectorReportingLevels: Sequelize.BelongsToManyCountAssociationsMixin;
  // SubSector hasMany SubCategory via subsectorId
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
  // SubSector hasMany SubSectorReportingLevel via subsectorId
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

  static initModel(sequelize: Sequelize.Sequelize): typeof SubSector {
    return SubSector.init(
      {
        subsectorId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "subsector_id",
        },
        subsectorName: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "subsector_name",
        },
        sectorId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "Sector",
            key: "sector_id",
          },
          field: "sector_id",
        },
        referenceNumber: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "reference_number",
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
      },
      {
        sequelize,
        tableName: "SubSector",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "SubSector_pkey",
            unique: true,
            fields: [{ name: "subsector_id" }],
          },
        ],
      },
    );
  }
}
