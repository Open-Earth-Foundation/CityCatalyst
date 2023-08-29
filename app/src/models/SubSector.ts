import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { DataSource, DataSourceId } from "./DataSource";
import type {
  DataSourceSubSector,
  DataSourceSubSectorId,
} from "./DataSourceSubSector";
import type { ReportingLevel, ReportingLevelId } from "./ReportingLevel";
import type { Scope, ScopeId } from "./Scope";
import type { Sector, SectorId } from "./Sector";
import type { SubCategory, SubCategoryId } from "./SubCategory";
import type {
  SubSectorReportingLevel,
  SubSectorReportingLevelId,
} from "./SubSectorReportingLevel";
import type { SubSectorScope, SubSectorScopeId } from "./SubSectorScope";
import type { SubSectorValue, SubSectorValueId } from "./SubSectorValue";

export interface SubSectorAttributes {
  subsectorId: string;
  subsectorName?: string;
  sectorId?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type SubSectorPk = "subsectorId";
export type SubSectorId = SubSector[SubSectorPk];
export type SubSectorOptionalAttributes =
  | "subsectorName"
  | "sectorId"
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
  created?: Date;
  lastUpdated?: Date;

  // SubSector belongsTo Sector via sectorId
  sector!: Sector;
  getSector!: Sequelize.BelongsToGetAssociationMixin<Sector>;
  setSector!: Sequelize.BelongsToSetAssociationMixin<Sector, SectorId>;
  createSector!: Sequelize.BelongsToCreateAssociationMixin<Sector>;
  // SubSector belongsToMany DataSource via subsectorId and datasourceId
  datasourceIdDataSourceDataSourceSubSectors!: DataSource[];
  getDatasourceIdDataSourceDataSourceSubSectors!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasourceIdDataSourceDataSourceSubSectors!: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  addDatasourceIdDataSourceDataSourceSubSector!: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  addDatasourceIdDataSourceDataSourceSubSectors!: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  createDatasourceIdDataSourceDataSourceSubSector!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasourceIdDataSourceDataSourceSubSector!: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  removeDatasourceIdDataSourceDataSourceSubSectors!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  hasDatasourceIdDataSourceDataSourceSubSector!: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  hasDatasourceIdDataSourceDataSourceSubSectors!: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  countDatasourceIdDataSourceDataSourceSubSectors!: Sequelize.BelongsToManyCountAssociationsMixin;
  // SubSector hasMany DataSourceSubSector via subsectorId
  dataSourceSubSectors!: DataSourceSubSector[];
  getDataSourceSubSectors!: Sequelize.HasManyGetAssociationsMixin<DataSourceSubSector>;
  setDataSourceSubSectors!: Sequelize.HasManySetAssociationsMixin<
    DataSourceSubSector,
    DataSourceSubSectorId
  >;
  addDataSourceSubSector!: Sequelize.HasManyAddAssociationMixin<
    DataSourceSubSector,
    DataSourceSubSectorId
  >;
  addDataSourceSubSectors!: Sequelize.HasManyAddAssociationsMixin<
    DataSourceSubSector,
    DataSourceSubSectorId
  >;
  createDataSourceSubSector!: Sequelize.HasManyCreateAssociationMixin<DataSourceSubSector>;
  removeDataSourceSubSector!: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceSubSector,
    DataSourceSubSectorId
  >;
  removeDataSourceSubSectors!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceSubSector,
    DataSourceSubSectorId
  >;
  hasDataSourceSubSector!: Sequelize.HasManyHasAssociationMixin<
    DataSourceSubSector,
    DataSourceSubSectorId
  >;
  hasDataSourceSubSectors!: Sequelize.HasManyHasAssociationsMixin<
    DataSourceSubSector,
    DataSourceSubSectorId
  >;
  countDataSourceSubSectors!: Sequelize.HasManyCountAssociationsMixin;
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
  scopeIdScopeSubSectorScopes!: Scope[];
  getScopeIdScopeSubSectorScopes!: Sequelize.BelongsToManyGetAssociationsMixin<Scope>;
  setScopeIdScopeSubSectorScopes!: Sequelize.BelongsToManySetAssociationsMixin<
    Scope,
    ScopeId
  >;
  addScopeIdScopeSubSectorScope!: Sequelize.BelongsToManyAddAssociationMixin<
    Scope,
    ScopeId
  >;
  addScopeIdScopeSubSectorScopes!: Sequelize.BelongsToManyAddAssociationsMixin<
    Scope,
    ScopeId
  >;
  createScopeIdScopeSubSectorScope!: Sequelize.BelongsToManyCreateAssociationMixin<Scope>;
  removeScopeIdScopeSubSectorScope!: Sequelize.BelongsToManyRemoveAssociationMixin<
    Scope,
    ScopeId
  >;
  removeScopeIdScopeSubSectorScopes!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    Scope,
    ScopeId
  >;
  hasScopeIdScopeSubSectorScope!: Sequelize.BelongsToManyHasAssociationMixin<
    Scope,
    ScopeId
  >;
  hasScopeIdScopeSubSectorScopes!: Sequelize.BelongsToManyHasAssociationsMixin<
    Scope,
    ScopeId
  >;
  countScopeIdScopeSubSectorScopes!: Sequelize.BelongsToManyCountAssociationsMixin;
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
  // SubSector hasMany SubSectorScope via subsectorId
  subSectorScopes!: SubSectorScope[];
  getSubSectorScopes!: Sequelize.HasManyGetAssociationsMixin<SubSectorScope>;
  setSubSectorScopes!: Sequelize.HasManySetAssociationsMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  addSubSectorScope!: Sequelize.HasManyAddAssociationMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  addSubSectorScopes!: Sequelize.HasManyAddAssociationsMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  createSubSectorScope!: Sequelize.HasManyCreateAssociationMixin<SubSectorScope>;
  removeSubSectorScope!: Sequelize.HasManyRemoveAssociationMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  removeSubSectorScopes!: Sequelize.HasManyRemoveAssociationsMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  hasSubSectorScope!: Sequelize.HasManyHasAssociationMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  hasSubSectorScopes!: Sequelize.HasManyHasAssociationsMixin<
    SubSectorScope,
    SubSectorScopeId
  >;
  countSubSectorScopes!: Sequelize.HasManyCountAssociationsMixin;
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
