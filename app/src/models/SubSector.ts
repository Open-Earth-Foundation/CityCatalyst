import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { DataSource, DataSourceId } from "./DataSource";
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
  implements SubSectorAttributes
{
  subsectorId!: string;
  subsectorName?: string;
  sectorId?: string;
  created?: Date;
  lastUpdated?: Date;
  referenceNumber?: string;
  scopeId?: string;

  // SubSector belongsTo Scope via scopeId
  scope!: Scope;
  getScope!: Sequelize.BelongsToGetAssociationMixin<Scope>;
  setScope!: Sequelize.BelongsToSetAssociationMixin<Scope, ScopeId>;
  createScope!: Sequelize.BelongsToCreateAssociationMixin<Scope>;
  // SubSector belongsTo Sector via sectorId
  sector!: Sector;
  getSector!: Sequelize.BelongsToGetAssociationMixin<Sector>;
  setSector!: Sequelize.BelongsToSetAssociationMixin<Sector, SectorId>;
  createSector!: Sequelize.BelongsToCreateAssociationMixin<Sector>;
  // SubSector hasMany DataSource via subsectorId
  dataSources!: DataSource[];
  getDataSources!: Sequelize.HasManyGetAssociationsMixin<DataSource>;
  setDataSources!: Sequelize.HasManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  addDataSource!: Sequelize.HasManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  addDataSources!: Sequelize.HasManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  createDataSource!: Sequelize.HasManyCreateAssociationMixin<DataSource>;
  removeDataSource!: Sequelize.HasManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  removeDataSources!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  hasDataSource!: Sequelize.HasManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  hasDataSources!: Sequelize.HasManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  countDataSources!: Sequelize.HasManyCountAssociationsMixin;
  // SubSector hasMany InventoryValue via subSectorId
  inventoryValues!: InventoryValue[];
  getInventoryValues!: Sequelize.HasManyGetAssociationsMixin<InventoryValue>;
  setInventoryValues!: Sequelize.HasManySetAssociationsMixin<
    InventoryValue,
    InventoryValueId
  >;
  addInventoryValue!: Sequelize.HasManyAddAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  addInventoryValues!: Sequelize.HasManyAddAssociationsMixin<
    InventoryValue,
    InventoryValueId
  >;
  createInventoryValue!: Sequelize.HasManyCreateAssociationMixin<InventoryValue>;
  removeInventoryValue!: Sequelize.HasManyRemoveAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  removeInventoryValues!: Sequelize.HasManyRemoveAssociationsMixin<
    InventoryValue,
    InventoryValueId
  >;
  hasInventoryValue!: Sequelize.HasManyHasAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  hasInventoryValues!: Sequelize.HasManyHasAssociationsMixin<
    InventoryValue,
    InventoryValueId
  >;
  countInventoryValues!: Sequelize.HasManyCountAssociationsMixin;
  // SubSector belongsToMany ReportingLevel via subsectorId and reportinglevelId
  reportinglevelIdReportingLevelSubSectorReportingLevels!: ReportingLevel[];
  getReportinglevelIdReportingLevelSubSectorReportingLevels!: Sequelize.BelongsToManyGetAssociationsMixin<ReportingLevel>;
  setReportinglevelIdReportingLevelSubSectorReportingLevels!: Sequelize.BelongsToManySetAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  addReportinglevelIdReportingLevelSubSectorReportingLevel!: Sequelize.BelongsToManyAddAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  addReportinglevelIdReportingLevelSubSectorReportingLevels!: Sequelize.BelongsToManyAddAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  createReportinglevelIdReportingLevelSubSectorReportingLevel!: Sequelize.BelongsToManyCreateAssociationMixin<ReportingLevel>;
  removeReportinglevelIdReportingLevelSubSectorReportingLevel!: Sequelize.BelongsToManyRemoveAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  removeReportinglevelIdReportingLevelSubSectorReportingLevels!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  hasReportinglevelIdReportingLevelSubSectorReportingLevel!: Sequelize.BelongsToManyHasAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  hasReportinglevelIdReportingLevelSubSectorReportingLevels!: Sequelize.BelongsToManyHasAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  countReportinglevelIdReportingLevelSubSectorReportingLevels!: Sequelize.BelongsToManyCountAssociationsMixin;
  // SubSector hasMany SubCategory via subsectorId
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
  // SubSector hasMany SubSectorReportingLevel via subsectorId
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
