import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { DataSource, DataSourceId } from "./DataSource";
import type { ReportingLevel, ReportingLevelId } from "./ReportingLevel";
import type { Scope, ScopeId } from "./Scope";
import type { Sector, SectorId } from "./Sector";
import type { SubCategory, SubCategoryId } from "./SubCategory";
import type {
  SubSectorReportingLevel,
  SubSectorReportingLevelId,
} from "./SubSectorReportingLevel";
import type { SubSectorValue, SubSectorValueId } from "./SubSectorValue";

export interface SubSectorAttributes {
  subsectorId: string;
  subsectorName?: string;
  sectorId?: string;
  referenceNumber?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type SubSectorPk = "subsectorId";
export type SubSectorId = SubSector[SubSectorPk];
export type SubSectorOptionalAttributes =
  | "subsectorName"
  | "sectorId"
  | "referenceNumber"
  | "created"
  | "lastUpdated";
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
  referenceNumber?: string;
  created?: Date;
  lastUpdated?: Date;

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
  // SubSector belongsToMany Scope via subsectorId and scopeId
  scopeIdScopeScopes!: Scope[];
  getScopeIdScopeScopes!: Sequelize.BelongsToManyGetAssociationsMixin<Scope>;
  setScopeIdScopeScopes!: Sequelize.BelongsToManySetAssociationsMixin<
    Scope,
    ScopeId
  >;
  addScopeIdScopeScope!: Sequelize.BelongsToManyAddAssociationMixin<
    Scope,
    ScopeId
  >;
  addScopeIdScopeScopes!: Sequelize.BelongsToManyAddAssociationsMixin<
    Scope,
    ScopeId
  >;
  createScopeIdScopeScope!: Sequelize.BelongsToManyCreateAssociationMixin<Scope>;
  removeScopeIdScopeScope!: Sequelize.BelongsToManyRemoveAssociationMixin<
    Scope,
    ScopeId
  >;
  removeScopeIdScopeScopes!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    Scope,
    ScopeId
  >;
  hasScopeIdScopeScope!: Sequelize.BelongsToManyHasAssociationMixin<
    Scope,
    ScopeId
  >;
  hasScopeIdScopeScopes!: Sequelize.BelongsToManyHasAssociationsMixin<
    Scope,
    ScopeId
  >;
  countScopeIdScopeScopes!: Sequelize.BelongsToManyCountAssociationsMixin;
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
  // SubSector hasOne Scope via scopeId
  scope!: Scope;
  getScope!: Sequelize.HasOneGetAssociationMixin<Scope>;
  setScope!: Sequelize.HasOneSetAssociationMixin<
    Scope,
    ScopeId
  >;
  createScope!: Sequelize.HasOneCreateAssociationMixin<Scope>;
  // SubSector hasMany SubSectorValue via subsectorId
  subSectorValues!: SubSectorValue[];
  getSubSectorValues!: Sequelize.HasManyGetAssociationsMixin<SubSectorValue>;
  setSubSectorValues!: Sequelize.HasManySetAssociationsMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  addSubSectorValue!: Sequelize.HasManyAddAssociationMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  addSubSectorValues!: Sequelize.HasManyAddAssociationsMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  createSubSectorValue!: Sequelize.HasManyCreateAssociationMixin<SubSectorValue>;
  removeSubSectorValue!: Sequelize.HasManyRemoveAssociationMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  removeSubSectorValues!: Sequelize.HasManyRemoveAssociationsMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  hasSubSectorValue!: Sequelize.HasManyHasAssociationMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  hasSubSectorValues!: Sequelize.HasManyHasAssociationsMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  countSubSectorValues!: Sequelize.HasManyCountAssociationsMixin;

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
