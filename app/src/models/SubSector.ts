import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { DataSourceSubSector, DataSourceSubSectorId } from './DataSourceSubSector';
import type { ReportingLevel, ReportingLevelId } from './ReportingLevel';
import type { Scope, ScopeId } from './Scope';
import type { Sector, SectorId } from './Sector';
import type { SubCategory, SubCategoryId } from './SubCategory';
import type { SubSectorReportingLevel, SubSectorReportingLevelId } from './SubSectorReportingLevel';
import type { SubSectorScope, SubSectorScopeId } from './SubSectorScope';
import type { SubSectorValue, SubSectorValueId } from './SubSectorValue';

export interface SubSectorAttributes {
  subsector_id: string;
  subsector_name?: string;
  sector_id?: string;
  created?: Date;
  last_updated?: Date;
}

export type SubSectorPk = "subsector_id";
export type SubSectorId = SubSector[SubSectorPk];
export type SubSectorOptionalAttributes = "subsector_name" | "sector_id" | "created" | "last_updated";
export type SubSectorCreationAttributes = Optional<SubSectorAttributes, SubSectorOptionalAttributes>;

export class SubSector extends Model<SubSectorAttributes, SubSectorCreationAttributes> implements SubSectorAttributes {
  subsector_id!: string;
  subsector_name?: string;
  sector_id?: string;
  created?: Date;
  last_updated?: Date;

  // SubSector belongsTo Sector via sector_id
  sector!: Sector;
  getSector!: Sequelize.BelongsToGetAssociationMixin<Sector>;
  setSector!: Sequelize.BelongsToSetAssociationMixin<Sector, SectorId>;
  createSector!: Sequelize.BelongsToCreateAssociationMixin<Sector>;
  // SubSector belongsToMany DataSource via subsector_id and datasource_id
  datasource_id_DataSource_DataSourceSubSectors!: DataSource[];
  getDatasource_id_DataSource_DataSourceSubSectors!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasource_id_DataSource_DataSourceSubSectors!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceSubSector!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceSubSectors!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasource_id_DataSource_DataSourceSubSector!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasource_id_DataSource_DataSourceSubSector!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasource_id_DataSource_DataSourceSubSectors!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceSubSector!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceSubSectors!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasource_id_DataSource_DataSourceSubSectors!: Sequelize.BelongsToManyCountAssociationsMixin;
  // SubSector hasMany DataSourceSubSector via subsector_id
  DataSourceSubSectors!: DataSourceSubSector[];
  getDataSourceSubSectors!: Sequelize.HasManyGetAssociationsMixin<DataSourceSubSector>;
  setDataSourceSubSectors!: Sequelize.HasManySetAssociationsMixin<DataSourceSubSector, DataSourceSubSectorId>;
  addDataSourceSubSector!: Sequelize.HasManyAddAssociationMixin<DataSourceSubSector, DataSourceSubSectorId>;
  addDataSourceSubSectors!: Sequelize.HasManyAddAssociationsMixin<DataSourceSubSector, DataSourceSubSectorId>;
  createDataSourceSubSector!: Sequelize.HasManyCreateAssociationMixin<DataSourceSubSector>;
  removeDataSourceSubSector!: Sequelize.HasManyRemoveAssociationMixin<DataSourceSubSector, DataSourceSubSectorId>;
  removeDataSourceSubSectors!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceSubSector, DataSourceSubSectorId>;
  hasDataSourceSubSector!: Sequelize.HasManyHasAssociationMixin<DataSourceSubSector, DataSourceSubSectorId>;
  hasDataSourceSubSectors!: Sequelize.HasManyHasAssociationsMixin<DataSourceSubSector, DataSourceSubSectorId>;
  countDataSourceSubSectors!: Sequelize.HasManyCountAssociationsMixin;
  // SubSector belongsToMany ReportingLevel via subsector_id and reportinglevel_id
  reportinglevel_id_ReportingLevel_SubSectorReportingLevels!: ReportingLevel[];
  getReportinglevel_id_ReportingLevel_SubSectorReportingLevels!: Sequelize.BelongsToManyGetAssociationsMixin<ReportingLevel>;
  setReportinglevel_id_ReportingLevel_SubSectorReportingLevels!: Sequelize.BelongsToManySetAssociationsMixin<ReportingLevel, ReportingLevelId>;
  addReportinglevel_id_ReportingLevel_SubSectorReportingLevel!: Sequelize.BelongsToManyAddAssociationMixin<ReportingLevel, ReportingLevelId>;
  addReportinglevel_id_ReportingLevel_SubSectorReportingLevels!: Sequelize.BelongsToManyAddAssociationsMixin<ReportingLevel, ReportingLevelId>;
  createReportinglevel_id_ReportingLevel_SubSectorReportingLevel!: Sequelize.BelongsToManyCreateAssociationMixin<ReportingLevel>;
  removeReportinglevel_id_ReportingLevel_SubSectorReportingLevel!: Sequelize.BelongsToManyRemoveAssociationMixin<ReportingLevel, ReportingLevelId>;
  removeReportinglevel_id_ReportingLevel_SubSectorReportingLevels!: Sequelize.BelongsToManyRemoveAssociationsMixin<ReportingLevel, ReportingLevelId>;
  hasReportinglevel_id_ReportingLevel_SubSectorReportingLevel!: Sequelize.BelongsToManyHasAssociationMixin<ReportingLevel, ReportingLevelId>;
  hasReportinglevel_id_ReportingLevel_SubSectorReportingLevels!: Sequelize.BelongsToManyHasAssociationsMixin<ReportingLevel, ReportingLevelId>;
  countReportinglevel_id_ReportingLevel_SubSectorReportingLevels!: Sequelize.BelongsToManyCountAssociationsMixin;
  // SubSector belongsToMany Scope via subsector_id and scope_id
  scope_id_Scope_SubSectorScopes!: Scope[];
  getScope_id_Scope_SubSectorScopes!: Sequelize.BelongsToManyGetAssociationsMixin<Scope>;
  setScope_id_Scope_SubSectorScopes!: Sequelize.BelongsToManySetAssociationsMixin<Scope, ScopeId>;
  addScope_id_Scope_SubSectorScope!: Sequelize.BelongsToManyAddAssociationMixin<Scope, ScopeId>;
  addScope_id_Scope_SubSectorScopes!: Sequelize.BelongsToManyAddAssociationsMixin<Scope, ScopeId>;
  createScope_id_Scope_SubSectorScope!: Sequelize.BelongsToManyCreateAssociationMixin<Scope>;
  removeScope_id_Scope_SubSectorScope!: Sequelize.BelongsToManyRemoveAssociationMixin<Scope, ScopeId>;
  removeScope_id_Scope_SubSectorScopes!: Sequelize.BelongsToManyRemoveAssociationsMixin<Scope, ScopeId>;
  hasScope_id_Scope_SubSectorScope!: Sequelize.BelongsToManyHasAssociationMixin<Scope, ScopeId>;
  hasScope_id_Scope_SubSectorScopes!: Sequelize.BelongsToManyHasAssociationsMixin<Scope, ScopeId>;
  countScope_id_Scope_SubSectorScopes!: Sequelize.BelongsToManyCountAssociationsMixin;
  // SubSector hasMany SubCategory via subsector_id
  SubCategories!: SubCategory[];
  getSubCategories!: Sequelize.HasManyGetAssociationsMixin<SubCategory>;
  setSubCategories!: Sequelize.HasManySetAssociationsMixin<SubCategory, SubCategoryId>;
  addSubCategory!: Sequelize.HasManyAddAssociationMixin<SubCategory, SubCategoryId>;
  addSubCategories!: Sequelize.HasManyAddAssociationsMixin<SubCategory, SubCategoryId>;
  createSubCategory!: Sequelize.HasManyCreateAssociationMixin<SubCategory>;
  removeSubCategory!: Sequelize.HasManyRemoveAssociationMixin<SubCategory, SubCategoryId>;
  removeSubCategories!: Sequelize.HasManyRemoveAssociationsMixin<SubCategory, SubCategoryId>;
  hasSubCategory!: Sequelize.HasManyHasAssociationMixin<SubCategory, SubCategoryId>;
  hasSubCategories!: Sequelize.HasManyHasAssociationsMixin<SubCategory, SubCategoryId>;
  countSubCategories!: Sequelize.HasManyCountAssociationsMixin;
  // SubSector hasMany SubSectorReportingLevel via subsector_id
  SubSectorReportingLevels!: SubSectorReportingLevel[];
  getSubSectorReportingLevels!: Sequelize.HasManyGetAssociationsMixin<SubSectorReportingLevel>;
  setSubSectorReportingLevels!: Sequelize.HasManySetAssociationsMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  addSubSectorReportingLevel!: Sequelize.HasManyAddAssociationMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  addSubSectorReportingLevels!: Sequelize.HasManyAddAssociationsMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  createSubSectorReportingLevel!: Sequelize.HasManyCreateAssociationMixin<SubSectorReportingLevel>;
  removeSubSectorReportingLevel!: Sequelize.HasManyRemoveAssociationMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  removeSubSectorReportingLevels!: Sequelize.HasManyRemoveAssociationsMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  hasSubSectorReportingLevel!: Sequelize.HasManyHasAssociationMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  hasSubSectorReportingLevels!: Sequelize.HasManyHasAssociationsMixin<SubSectorReportingLevel, SubSectorReportingLevelId>;
  countSubSectorReportingLevels!: Sequelize.HasManyCountAssociationsMixin;
  // SubSector hasMany SubSectorScope via subsector_id
  SubSectorScopes!: SubSectorScope[];
  getSubSectorScopes!: Sequelize.HasManyGetAssociationsMixin<SubSectorScope>;
  setSubSectorScopes!: Sequelize.HasManySetAssociationsMixin<SubSectorScope, SubSectorScopeId>;
  addSubSectorScope!: Sequelize.HasManyAddAssociationMixin<SubSectorScope, SubSectorScopeId>;
  addSubSectorScopes!: Sequelize.HasManyAddAssociationsMixin<SubSectorScope, SubSectorScopeId>;
  createSubSectorScope!: Sequelize.HasManyCreateAssociationMixin<SubSectorScope>;
  removeSubSectorScope!: Sequelize.HasManyRemoveAssociationMixin<SubSectorScope, SubSectorScopeId>;
  removeSubSectorScopes!: Sequelize.HasManyRemoveAssociationsMixin<SubSectorScope, SubSectorScopeId>;
  hasSubSectorScope!: Sequelize.HasManyHasAssociationMixin<SubSectorScope, SubSectorScopeId>;
  hasSubSectorScopes!: Sequelize.HasManyHasAssociationsMixin<SubSectorScope, SubSectorScopeId>;
  countSubSectorScopes!: Sequelize.HasManyCountAssociationsMixin;
  // SubSector hasMany SubSectorValue via subsector_id
  SubSectorValues!: SubSectorValue[];
  getSubSectorValues!: Sequelize.HasManyGetAssociationsMixin<SubSectorValue>;
  setSubSectorValues!: Sequelize.HasManySetAssociationsMixin<SubSectorValue, SubSectorValueId>;
  addSubSectorValue!: Sequelize.HasManyAddAssociationMixin<SubSectorValue, SubSectorValueId>;
  addSubSectorValues!: Sequelize.HasManyAddAssociationsMixin<SubSectorValue, SubSectorValueId>;
  createSubSectorValue!: Sequelize.HasManyCreateAssociationMixin<SubSectorValue>;
  removeSubSectorValue!: Sequelize.HasManyRemoveAssociationMixin<SubSectorValue, SubSectorValueId>;
  removeSubSectorValues!: Sequelize.HasManyRemoveAssociationsMixin<SubSectorValue, SubSectorValueId>;
  hasSubSectorValue!: Sequelize.HasManyHasAssociationMixin<SubSectorValue, SubSectorValueId>;
  hasSubSectorValues!: Sequelize.HasManyHasAssociationsMixin<SubSectorValue, SubSectorValueId>;
  countSubSectorValues!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof SubSector {
    return SubSector.init({
    subsector_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    subsector_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    sector_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Sector',
        key: 'sector_id'
      }
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_updated: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'SubSector',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "SubSector_pkey",
        unique: true,
        fields: [
          { name: "subsector_id" },
        ]
      },
    ]
  });
  }
}
