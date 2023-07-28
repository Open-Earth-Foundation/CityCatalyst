import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { ActivityData, ActivityDataId } from './ActivityData';
import type { DataSourceActivityData, DataSourceActivityDataId } from './DataSourceActivityData';
import type { DataSourceEmissionsFactor, DataSourceEmissionsFactorId } from './DataSourceEmissionsFactor';
import type { DataSourceGHGs, DataSourceGHGsId } from './DataSourceGHGs';
import type { DataSourceMethodology, DataSourceMethodologyId } from './DataSourceMethodology';
import type { DataSourceReportingLevel, DataSourceReportingLevelId } from './DataSourceReportingLevel';
import type { DataSourceScope, DataSourceScopeId } from './DataSourceScope';
import type { DataSourceSector, DataSourceSectorId } from './DataSourceSector';
import type { DataSourceSubCategory, DataSourceSubCategoryId } from './DataSourceSubCategory';
import type { DataSourceSubSector, DataSourceSubSectorId } from './DataSourceSubSector';
import type { EmissionsFactor, EmissionsFactorId } from './EmissionsFactor';
import type { GHGs, GHGsId } from './GHGs';
import type { Methodology, MethodologyId } from './Methodology';
import type { ReportingLevel, ReportingLevelId } from './ReportingLevel';
import type { Scope, ScopeId } from './Scope';
import type { Sector, SectorId } from './Sector';
import type { SubCategory, SubCategoryId } from './SubCategory';
import type { SubSector, SubSectorId } from './SubSector';

export interface DataSourceAttributes {
  datasource_id: string;
  name?: string;
  url?: string;
  description?: string;
  access_type?: string;
  geographical_location?: string;
  latest_accounting_year?: number;
  frequency_of_update?: string;
  spacial_resolution?: string;
  language?: string;
  accessibility?: string;
  data_quality?: string;
  notes?: string;
  created?: Date;
  last_updated?: Date;
}

export type DataSourcePk = "datasource_id";
export type DataSourceId = DataSource[DataSourcePk];
export type DataSourceOptionalAttributes = "name" | "url" | "description" | "access_type" | "geographical_location" | "latest_accounting_year" | "frequency_of_update" | "spacial_resolution" | "language" | "accessibility" | "data_quality" | "notes" | "created" | "last_updated";
export type DataSourceCreationAttributes = Optional<DataSourceAttributes, DataSourceOptionalAttributes>;

export class DataSource extends Model<DataSourceAttributes, DataSourceCreationAttributes> implements DataSourceAttributes {
  datasource_id!: string;
  name?: string;
  url?: string;
  description?: string;
  access_type?: string;
  geographical_location?: string;
  latest_accounting_year?: number;
  frequency_of_update?: string;
  spacial_resolution?: string;
  language?: string;
  accessibility?: string;
  data_quality?: string;
  notes?: string;
  created?: Date;
  last_updated?: Date;

  // DataSource belongsToMany ActivityData via datasource_id and activitydata_id
  activitydata_id_ActivityData!: ActivityData[];
  getActivitydata_id_ActivityData!: Sequelize.BelongsToManyGetAssociationsMixin<ActivityData>;
  setActivitydata_id_ActivityData!: Sequelize.BelongsToManySetAssociationsMixin<ActivityData, ActivityDataId>;
  addActivitydata_id_ActivityDatum!: Sequelize.BelongsToManyAddAssociationMixin<ActivityData, ActivityDataId>;
  addActivitydata_id_ActivityData!: Sequelize.BelongsToManyAddAssociationsMixin<ActivityData, ActivityDataId>;
  createActivitydata_id_ActivityDatum!: Sequelize.BelongsToManyCreateAssociationMixin<ActivityData>;
  removeActivitydata_id_ActivityDatum!: Sequelize.BelongsToManyRemoveAssociationMixin<ActivityData, ActivityDataId>;
  removeActivitydata_id_ActivityData!: Sequelize.BelongsToManyRemoveAssociationsMixin<ActivityData, ActivityDataId>;
  hasActivitydata_id_ActivityDatum!: Sequelize.BelongsToManyHasAssociationMixin<ActivityData, ActivityDataId>;
  hasActivitydata_id_ActivityData!: Sequelize.BelongsToManyHasAssociationsMixin<ActivityData, ActivityDataId>;
  countActivitydata_id_ActivityData!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource hasMany DataSourceActivityData via datasource_id
  DataSourceActivityData!: DataSourceActivityData[];
  getDataSourceActivityData!: Sequelize.HasManyGetAssociationsMixin<DataSourceActivityData>;
  setDataSourceActivityData!: Sequelize.HasManySetAssociationsMixin<DataSourceActivityData, DataSourceActivityDataId>;
  addDataSourceActivityDatum!: Sequelize.HasManyAddAssociationMixin<DataSourceActivityData, DataSourceActivityDataId>;
  addDataSourceActivityData!: Sequelize.HasManyAddAssociationsMixin<DataSourceActivityData, DataSourceActivityDataId>;
  createDataSourceActivityDatum!: Sequelize.HasManyCreateAssociationMixin<DataSourceActivityData>;
  removeDataSourceActivityDatum!: Sequelize.HasManyRemoveAssociationMixin<DataSourceActivityData, DataSourceActivityDataId>;
  removeDataSourceActivityData!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceActivityData, DataSourceActivityDataId>;
  hasDataSourceActivityDatum!: Sequelize.HasManyHasAssociationMixin<DataSourceActivityData, DataSourceActivityDataId>;
  hasDataSourceActivityData!: Sequelize.HasManyHasAssociationsMixin<DataSourceActivityData, DataSourceActivityDataId>;
  countDataSourceActivityData!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceEmissionsFactor via datasource_id
  DataSourceEmissionsFactors!: DataSourceEmissionsFactor[];
  getDataSourceEmissionsFactors!: Sequelize.HasManyGetAssociationsMixin<DataSourceEmissionsFactor>;
  setDataSourceEmissionsFactors!: Sequelize.HasManySetAssociationsMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  addDataSourceEmissionsFactor!: Sequelize.HasManyAddAssociationMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  addDataSourceEmissionsFactors!: Sequelize.HasManyAddAssociationsMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  createDataSourceEmissionsFactor!: Sequelize.HasManyCreateAssociationMixin<DataSourceEmissionsFactor>;
  removeDataSourceEmissionsFactor!: Sequelize.HasManyRemoveAssociationMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  removeDataSourceEmissionsFactors!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  hasDataSourceEmissionsFactor!: Sequelize.HasManyHasAssociationMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  hasDataSourceEmissionsFactors!: Sequelize.HasManyHasAssociationsMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  countDataSourceEmissionsFactors!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceGHGs via datasource_id
  DataSourceGHGs!: DataSourceGHGs[];
  getDataSourceGHGs!: Sequelize.HasManyGetAssociationsMixin<DataSourceGHGs>;
  setDataSourceGHGs!: Sequelize.HasManySetAssociationsMixin<DataSourceGHGs, DataSourceGHGsId>;
  addDataSourceGHG!: Sequelize.HasManyAddAssociationMixin<DataSourceGHGs, DataSourceGHGsId>;
  addDataSourceGHGs!: Sequelize.HasManyAddAssociationsMixin<DataSourceGHGs, DataSourceGHGsId>;
  createDataSourceGHG!: Sequelize.HasManyCreateAssociationMixin<DataSourceGHGs>;
  removeDataSourceGHG!: Sequelize.HasManyRemoveAssociationMixin<DataSourceGHGs, DataSourceGHGsId>;
  removeDataSourceGHGs!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceGHGs, DataSourceGHGsId>;
  hasDataSourceGHG!: Sequelize.HasManyHasAssociationMixin<DataSourceGHGs, DataSourceGHGsId>;
  hasDataSourceGHGs!: Sequelize.HasManyHasAssociationsMixin<DataSourceGHGs, DataSourceGHGsId>;
  countDataSourceGHGs!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceMethodology via datasource_id
  DataSourceMethodologies!: DataSourceMethodology[];
  getDataSourceMethodologies!: Sequelize.HasManyGetAssociationsMixin<DataSourceMethodology>;
  setDataSourceMethodologies!: Sequelize.HasManySetAssociationsMixin<DataSourceMethodology, DataSourceMethodologyId>;
  addDataSourceMethodology!: Sequelize.HasManyAddAssociationMixin<DataSourceMethodology, DataSourceMethodologyId>;
  addDataSourceMethodologies!: Sequelize.HasManyAddAssociationsMixin<DataSourceMethodology, DataSourceMethodologyId>;
  createDataSourceMethodology!: Sequelize.HasManyCreateAssociationMixin<DataSourceMethodology>;
  removeDataSourceMethodology!: Sequelize.HasManyRemoveAssociationMixin<DataSourceMethodology, DataSourceMethodologyId>;
  removeDataSourceMethodologies!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceMethodology, DataSourceMethodologyId>;
  hasDataSourceMethodology!: Sequelize.HasManyHasAssociationMixin<DataSourceMethodology, DataSourceMethodologyId>;
  hasDataSourceMethodologies!: Sequelize.HasManyHasAssociationsMixin<DataSourceMethodology, DataSourceMethodologyId>;
  countDataSourceMethodologies!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceReportingLevel via datasource_id
  DataSourceReportingLevels!: DataSourceReportingLevel[];
  getDataSourceReportingLevels!: Sequelize.HasManyGetAssociationsMixin<DataSourceReportingLevel>;
  setDataSourceReportingLevels!: Sequelize.HasManySetAssociationsMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  addDataSourceReportingLevel!: Sequelize.HasManyAddAssociationMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  addDataSourceReportingLevels!: Sequelize.HasManyAddAssociationsMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  createDataSourceReportingLevel!: Sequelize.HasManyCreateAssociationMixin<DataSourceReportingLevel>;
  removeDataSourceReportingLevel!: Sequelize.HasManyRemoveAssociationMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  removeDataSourceReportingLevels!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  hasDataSourceReportingLevel!: Sequelize.HasManyHasAssociationMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  hasDataSourceReportingLevels!: Sequelize.HasManyHasAssociationsMixin<DataSourceReportingLevel, DataSourceReportingLevelId>;
  countDataSourceReportingLevels!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceScope via datasource_id
  DataSourceScopes!: DataSourceScope[];
  getDataSourceScopes!: Sequelize.HasManyGetAssociationsMixin<DataSourceScope>;
  setDataSourceScopes!: Sequelize.HasManySetAssociationsMixin<DataSourceScope, DataSourceScopeId>;
  addDataSourceScope!: Sequelize.HasManyAddAssociationMixin<DataSourceScope, DataSourceScopeId>;
  addDataSourceScopes!: Sequelize.HasManyAddAssociationsMixin<DataSourceScope, DataSourceScopeId>;
  createDataSourceScope!: Sequelize.HasManyCreateAssociationMixin<DataSourceScope>;
  removeDataSourceScope!: Sequelize.HasManyRemoveAssociationMixin<DataSourceScope, DataSourceScopeId>;
  removeDataSourceScopes!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceScope, DataSourceScopeId>;
  hasDataSourceScope!: Sequelize.HasManyHasAssociationMixin<DataSourceScope, DataSourceScopeId>;
  hasDataSourceScopes!: Sequelize.HasManyHasAssociationsMixin<DataSourceScope, DataSourceScopeId>;
  countDataSourceScopes!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceSector via datasource_id
  DataSourceSectors!: DataSourceSector[];
  getDataSourceSectors!: Sequelize.HasManyGetAssociationsMixin<DataSourceSector>;
  setDataSourceSectors!: Sequelize.HasManySetAssociationsMixin<DataSourceSector, DataSourceSectorId>;
  addDataSourceSector!: Sequelize.HasManyAddAssociationMixin<DataSourceSector, DataSourceSectorId>;
  addDataSourceSectors!: Sequelize.HasManyAddAssociationsMixin<DataSourceSector, DataSourceSectorId>;
  createDataSourceSector!: Sequelize.HasManyCreateAssociationMixin<DataSourceSector>;
  removeDataSourceSector!: Sequelize.HasManyRemoveAssociationMixin<DataSourceSector, DataSourceSectorId>;
  removeDataSourceSectors!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceSector, DataSourceSectorId>;
  hasDataSourceSector!: Sequelize.HasManyHasAssociationMixin<DataSourceSector, DataSourceSectorId>;
  hasDataSourceSectors!: Sequelize.HasManyHasAssociationsMixin<DataSourceSector, DataSourceSectorId>;
  countDataSourceSectors!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceSubCategory via datasource_id
  DataSourceSubCategories!: DataSourceSubCategory[];
  getDataSourceSubCategories!: Sequelize.HasManyGetAssociationsMixin<DataSourceSubCategory>;
  setDataSourceSubCategories!: Sequelize.HasManySetAssociationsMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  addDataSourceSubCategory!: Sequelize.HasManyAddAssociationMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  addDataSourceSubCategories!: Sequelize.HasManyAddAssociationsMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  createDataSourceSubCategory!: Sequelize.HasManyCreateAssociationMixin<DataSourceSubCategory>;
  removeDataSourceSubCategory!: Sequelize.HasManyRemoveAssociationMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  removeDataSourceSubCategories!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  hasDataSourceSubCategory!: Sequelize.HasManyHasAssociationMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  hasDataSourceSubCategories!: Sequelize.HasManyHasAssociationsMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  countDataSourceSubCategories!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceSubSector via datasource_id
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
  // DataSource belongsToMany EmissionsFactor via datasource_id and emissions_factor_id
  emissions_factor_id_EmissionsFactors!: EmissionsFactor[];
  getEmissions_factor_id_EmissionsFactors!: Sequelize.BelongsToManyGetAssociationsMixin<EmissionsFactor>;
  setEmissions_factor_id_EmissionsFactors!: Sequelize.BelongsToManySetAssociationsMixin<EmissionsFactor, EmissionsFactorId>;
  addEmissions_factor_id_EmissionsFactor!: Sequelize.BelongsToManyAddAssociationMixin<EmissionsFactor, EmissionsFactorId>;
  addEmissions_factor_id_EmissionsFactors!: Sequelize.BelongsToManyAddAssociationsMixin<EmissionsFactor, EmissionsFactorId>;
  createEmissions_factor_id_EmissionsFactor!: Sequelize.BelongsToManyCreateAssociationMixin<EmissionsFactor>;
  removeEmissions_factor_id_EmissionsFactor!: Sequelize.BelongsToManyRemoveAssociationMixin<EmissionsFactor, EmissionsFactorId>;
  removeEmissions_factor_id_EmissionsFactors!: Sequelize.BelongsToManyRemoveAssociationsMixin<EmissionsFactor, EmissionsFactorId>;
  hasEmissions_factor_id_EmissionsFactor!: Sequelize.BelongsToManyHasAssociationMixin<EmissionsFactor, EmissionsFactorId>;
  hasEmissions_factor_id_EmissionsFactors!: Sequelize.BelongsToManyHasAssociationsMixin<EmissionsFactor, EmissionsFactorId>;
  countEmissions_factor_id_EmissionsFactors!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany GHGs via datasource_id and ghg_id
  ghg_id_GHGs!: GHGs[];
  getGhg_id_GHGs!: Sequelize.BelongsToManyGetAssociationsMixin<GHGs>;
  setGhg_id_GHGs!: Sequelize.BelongsToManySetAssociationsMixin<GHGs, GHGsId>;
  addGhg_id_GHG!: Sequelize.BelongsToManyAddAssociationMixin<GHGs, GHGsId>;
  addGhg_id_GHGs!: Sequelize.BelongsToManyAddAssociationsMixin<GHGs, GHGsId>;
  createGhg_id_GHG!: Sequelize.BelongsToManyCreateAssociationMixin<GHGs>;
  removeGhg_id_GHG!: Sequelize.BelongsToManyRemoveAssociationMixin<GHGs, GHGsId>;
  removeGhg_id_GHGs!: Sequelize.BelongsToManyRemoveAssociationsMixin<GHGs, GHGsId>;
  hasGhg_id_GHG!: Sequelize.BelongsToManyHasAssociationMixin<GHGs, GHGsId>;
  hasGhg_id_GHGs!: Sequelize.BelongsToManyHasAssociationsMixin<GHGs, GHGsId>;
  countGhg_id_GHGs!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany Methodology via datasource_id and methodology_id
  methodology_id_Methodologies!: Methodology[];
  getMethodology_id_Methodologies!: Sequelize.BelongsToManyGetAssociationsMixin<Methodology>;
  setMethodology_id_Methodologies!: Sequelize.BelongsToManySetAssociationsMixin<Methodology, MethodologyId>;
  addMethodology_id_Methodology!: Sequelize.BelongsToManyAddAssociationMixin<Methodology, MethodologyId>;
  addMethodology_id_Methodologies!: Sequelize.BelongsToManyAddAssociationsMixin<Methodology, MethodologyId>;
  createMethodology_id_Methodology!: Sequelize.BelongsToManyCreateAssociationMixin<Methodology>;
  removeMethodology_id_Methodology!: Sequelize.BelongsToManyRemoveAssociationMixin<Methodology, MethodologyId>;
  removeMethodology_id_Methodologies!: Sequelize.BelongsToManyRemoveAssociationsMixin<Methodology, MethodologyId>;
  hasMethodology_id_Methodology!: Sequelize.BelongsToManyHasAssociationMixin<Methodology, MethodologyId>;
  hasMethodology_id_Methodologies!: Sequelize.BelongsToManyHasAssociationsMixin<Methodology, MethodologyId>;
  countMethodology_id_Methodologies!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany ReportingLevel via datasource_id and reportinglevel_id
  reportinglevel_id_ReportingLevels!: ReportingLevel[];
  getReportinglevel_id_ReportingLevels!: Sequelize.BelongsToManyGetAssociationsMixin<ReportingLevel>;
  setReportinglevel_id_ReportingLevels!: Sequelize.BelongsToManySetAssociationsMixin<ReportingLevel, ReportingLevelId>;
  addReportinglevel_id_ReportingLevel!: Sequelize.BelongsToManyAddAssociationMixin<ReportingLevel, ReportingLevelId>;
  addReportinglevel_id_ReportingLevels!: Sequelize.BelongsToManyAddAssociationsMixin<ReportingLevel, ReportingLevelId>;
  createReportinglevel_id_ReportingLevel!: Sequelize.BelongsToManyCreateAssociationMixin<ReportingLevel>;
  removeReportinglevel_id_ReportingLevel!: Sequelize.BelongsToManyRemoveAssociationMixin<ReportingLevel, ReportingLevelId>;
  removeReportinglevel_id_ReportingLevels!: Sequelize.BelongsToManyRemoveAssociationsMixin<ReportingLevel, ReportingLevelId>;
  hasReportinglevel_id_ReportingLevel!: Sequelize.BelongsToManyHasAssociationMixin<ReportingLevel, ReportingLevelId>;
  hasReportinglevel_id_ReportingLevels!: Sequelize.BelongsToManyHasAssociationsMixin<ReportingLevel, ReportingLevelId>;
  countReportinglevel_id_ReportingLevels!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany Scope via datasource_id and scope_id
  scope_id_Scopes!: Scope[];
  getScope_id_Scopes!: Sequelize.BelongsToManyGetAssociationsMixin<Scope>;
  setScope_id_Scopes!: Sequelize.BelongsToManySetAssociationsMixin<Scope, ScopeId>;
  addScope_id_Scope!: Sequelize.BelongsToManyAddAssociationMixin<Scope, ScopeId>;
  addScope_id_Scopes!: Sequelize.BelongsToManyAddAssociationsMixin<Scope, ScopeId>;
  createScope_id_Scope!: Sequelize.BelongsToManyCreateAssociationMixin<Scope>;
  removeScope_id_Scope!: Sequelize.BelongsToManyRemoveAssociationMixin<Scope, ScopeId>;
  removeScope_id_Scopes!: Sequelize.BelongsToManyRemoveAssociationsMixin<Scope, ScopeId>;
  hasScope_id_Scope!: Sequelize.BelongsToManyHasAssociationMixin<Scope, ScopeId>;
  hasScope_id_Scopes!: Sequelize.BelongsToManyHasAssociationsMixin<Scope, ScopeId>;
  countScope_id_Scopes!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany Sector via datasource_id and sector_id
  sector_id_Sectors!: Sector[];
  getSector_id_Sectors!: Sequelize.BelongsToManyGetAssociationsMixin<Sector>;
  setSector_id_Sectors!: Sequelize.BelongsToManySetAssociationsMixin<Sector, SectorId>;
  addSector_id_Sector!: Sequelize.BelongsToManyAddAssociationMixin<Sector, SectorId>;
  addSector_id_Sectors!: Sequelize.BelongsToManyAddAssociationsMixin<Sector, SectorId>;
  createSector_id_Sector!: Sequelize.BelongsToManyCreateAssociationMixin<Sector>;
  removeSector_id_Sector!: Sequelize.BelongsToManyRemoveAssociationMixin<Sector, SectorId>;
  removeSector_id_Sectors!: Sequelize.BelongsToManyRemoveAssociationsMixin<Sector, SectorId>;
  hasSector_id_Sector!: Sequelize.BelongsToManyHasAssociationMixin<Sector, SectorId>;
  hasSector_id_Sectors!: Sequelize.BelongsToManyHasAssociationsMixin<Sector, SectorId>;
  countSector_id_Sectors!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany SubCategory via datasource_id and subcategory_id
  subcategory_id_SubCategories!: SubCategory[];
  getSubcategory_id_SubCategories!: Sequelize.BelongsToManyGetAssociationsMixin<SubCategory>;
  setSubcategory_id_SubCategories!: Sequelize.BelongsToManySetAssociationsMixin<SubCategory, SubCategoryId>;
  addSubcategory_id_SubCategory!: Sequelize.BelongsToManyAddAssociationMixin<SubCategory, SubCategoryId>;
  addSubcategory_id_SubCategories!: Sequelize.BelongsToManyAddAssociationsMixin<SubCategory, SubCategoryId>;
  createSubcategory_id_SubCategory!: Sequelize.BelongsToManyCreateAssociationMixin<SubCategory>;
  removeSubcategory_id_SubCategory!: Sequelize.BelongsToManyRemoveAssociationMixin<SubCategory, SubCategoryId>;
  removeSubcategory_id_SubCategories!: Sequelize.BelongsToManyRemoveAssociationsMixin<SubCategory, SubCategoryId>;
  hasSubcategory_id_SubCategory!: Sequelize.BelongsToManyHasAssociationMixin<SubCategory, SubCategoryId>;
  hasSubcategory_id_SubCategories!: Sequelize.BelongsToManyHasAssociationsMixin<SubCategory, SubCategoryId>;
  countSubcategory_id_SubCategories!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany SubSector via datasource_id and subsector_id
  subsector_id_SubSectors!: SubSector[];
  getSubsector_id_SubSectors!: Sequelize.BelongsToManyGetAssociationsMixin<SubSector>;
  setSubsector_id_SubSectors!: Sequelize.BelongsToManySetAssociationsMixin<SubSector, SubSectorId>;
  addSubsector_id_SubSector!: Sequelize.BelongsToManyAddAssociationMixin<SubSector, SubSectorId>;
  addSubsector_id_SubSectors!: Sequelize.BelongsToManyAddAssociationsMixin<SubSector, SubSectorId>;
  createSubsector_id_SubSector!: Sequelize.BelongsToManyCreateAssociationMixin<SubSector>;
  removeSubsector_id_SubSector!: Sequelize.BelongsToManyRemoveAssociationMixin<SubSector, SubSectorId>;
  removeSubsector_id_SubSectors!: Sequelize.BelongsToManyRemoveAssociationsMixin<SubSector, SubSectorId>;
  hasSubsector_id_SubSector!: Sequelize.BelongsToManyHasAssociationMixin<SubSector, SubSectorId>;
  hasSubsector_id_SubSectors!: Sequelize.BelongsToManyHasAssociationsMixin<SubSector, SubSectorId>;
  countSubsector_id_SubSectors!: Sequelize.BelongsToManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSource {
    return DataSource.init({
    datasource_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    url: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    access_type: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    geographical_location: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    latest_accounting_year: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    frequency_of_update: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    spacial_resolution: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    language: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    accessibility: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    data_quality: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
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
    tableName: 'DataSource',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "DataSource_pkey",
        unique: true,
        fields: [
          { name: "datasource_id" },
        ]
      },
    ]
  });
  }
}
