import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { ActivityData, ActivityDataId } from "./ActivityData";
import type {
  DataSourceActivityData,
  DataSourceActivityDataId,
} from "./DataSourceActivityData";
import type {
  DataSourceEmissionsFactor,
  DataSourceEmissionsFactorId,
} from "./DataSourceEmissionsFactor";
import type { DataSourceGHGs, DataSourceGHGsId } from "./DataSourceGHGs";
import type {
  DataSourceMethodology,
  DataSourceMethodologyId,
} from "./DataSourceMethodology";
import type {
  DataSourceReportingLevel,
  DataSourceReportingLevelId,
} from "./DataSourceReportingLevel";
import type { DataSourceScope, DataSourceScopeId } from "./DataSourceScope";
import type { DataSourceSector, DataSourceSectorId } from "./DataSourceSector";
import type {
  DataSourceSubCategory,
  DataSourceSubCategoryId,
} from "./DataSourceSubCategory";
import type {
  DataSourceSubSector,
  DataSourceSubSectorId,
} from "./DataSourceSubSector";
import type { EmissionsFactor, EmissionsFactorId } from "./EmissionsFactor";
import type { GDP, GDPId } from "./GDP";
import type { GHGs, GHGsId } from "./GHGs";
import type { Methodology, MethodologyId } from "./Methodology";
import type { Population, PopulationId } from "./Population";
import type { Publisher, PublisherId } from "./Publisher";
import type { ReportingLevel, ReportingLevelId } from "./ReportingLevel";
import type { Scope, ScopeId } from "./Scope";
import type { Sector, SectorId } from "./Sector";
import type { SubCategory, SubCategoryId } from "./SubCategory";
import type { SubSector, SubSectorId } from "./SubSector";

export interface DataSourceAttributes {
  datasourceId: string;
  name?: string;
  url?: string;
  description?: string;
  accessType?: string;
  geographicalLocation?: string;
  latestAccountingYear?: number;
  frequencyOfUpdate?: string;
  spacialResolution?: string;
  language?: string;
  accessibility?: string;
  dataQuality?: string;
  notes?: string;
  units?: string;
  methodologyUrl?: string;
  publisherId?: string;
  retrievalMethod?: string;
  apiEndpoint?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type DataSourcePk = "datasourceId";
export type DataSourceId = DataSource[DataSourcePk];
export type DataSourceOptionalAttributes =
  | "name"
  | "url"
  | "description"
  | "accessType"
  | "geographicalLocation"
  | "latestAccountingYear"
  | "frequencyOfUpdate"
  | "spacialResolution"
  | "language"
  | "accessibility"
  | "dataQuality"
  | "notes"
  | "units"
  | "methodologyUrl"
  | "publisherId"
  | "retrievalMethod"
  | "apiEndpoint"
  | "created"
  | "lastUpdated";
export type DataSourceCreationAttributes = Optional<
  DataSourceAttributes,
  DataSourceOptionalAttributes
>;

export class DataSource
  extends Model<DataSourceAttributes, DataSourceCreationAttributes>
  implements DataSourceAttributes
{
  datasourceId!: string;
  name?: string;
  url?: string;
  description?: string;
  accessType?: string;
  geographicalLocation?: string;
  latestAccountingYear?: number;
  frequencyOfUpdate?: string;
  spacialResolution?: string;
  language?: string;
  accessibility?: string;
  dataQuality?: string;
  notes?: string;
  units?: string;
  methodologyUrl?: string;
  publisherId?: string;
  retrievalMethod?: string;
  apiEndpoint?: string;
  created?: Date;
  lastUpdated?: Date;

  // DataSource belongsToMany ActivityData via datasourceId and activitydataId
  activitydataIdActivityData!: ActivityData[];
  getActivitydataIdActivityData!: Sequelize.BelongsToManyGetAssociationsMixin<ActivityData>;
  setActivitydataIdActivityData!: Sequelize.BelongsToManySetAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  addActivitydataIdActivityDatum!: Sequelize.BelongsToManyAddAssociationMixin<
    ActivityData,
    ActivityDataId
  >;
  addActivitydataIdActivityData!: Sequelize.BelongsToManyAddAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  createActivitydataIdActivityDatum!: Sequelize.BelongsToManyCreateAssociationMixin<ActivityData>;
  removeActivitydataIdActivityDatum!: Sequelize.BelongsToManyRemoveAssociationMixin<
    ActivityData,
    ActivityDataId
  >;
  removeActivitydataIdActivityData!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  hasActivitydataIdActivityDatum!: Sequelize.BelongsToManyHasAssociationMixin<
    ActivityData,
    ActivityDataId
  >;
  hasActivitydataIdActivityData!: Sequelize.BelongsToManyHasAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  countActivitydataIdActivityData!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource hasMany DataSourceActivityData via datasourceId
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
  // DataSource hasMany DataSourceEmissionsFactor via datasourceId
  dataSourceEmissionsFactors!: DataSourceEmissionsFactor[];
  getDataSourceEmissionsFactors!: Sequelize.HasManyGetAssociationsMixin<DataSourceEmissionsFactor>;
  setDataSourceEmissionsFactors!: Sequelize.HasManySetAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  addDataSourceEmissionsFactor!: Sequelize.HasManyAddAssociationMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  addDataSourceEmissionsFactors!: Sequelize.HasManyAddAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  createDataSourceEmissionsFactor!: Sequelize.HasManyCreateAssociationMixin<DataSourceEmissionsFactor>;
  removeDataSourceEmissionsFactor!: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  removeDataSourceEmissionsFactors!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  hasDataSourceEmissionsFactor!: Sequelize.HasManyHasAssociationMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  hasDataSourceEmissionsFactors!: Sequelize.HasManyHasAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  countDataSourceEmissionsFactors!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceGHGs via datasourceId
  dataSourceGhgs!: DataSourceGHGs[];
  getDataSourceGhgs!: Sequelize.HasManyGetAssociationsMixin<DataSourceGHGs>;
  setDataSourceGhgs!: Sequelize.HasManySetAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  addDataSourceGhg!: Sequelize.HasManyAddAssociationMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  addDataSourceGhgs!: Sequelize.HasManyAddAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  createDataSourceGhg!: Sequelize.HasManyCreateAssociationMixin<DataSourceGHGs>;
  removeDataSourceGhg!: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  removeDataSourceGhgs!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  hasDataSourceGhg!: Sequelize.HasManyHasAssociationMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  hasDataSourceGhgs!: Sequelize.HasManyHasAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  countDataSourceGhgs!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceMethodology via datasourceId
  dataSourceMethodologies!: DataSourceMethodology[];
  getDataSourceMethodologies!: Sequelize.HasManyGetAssociationsMixin<DataSourceMethodology>;
  setDataSourceMethodologies!: Sequelize.HasManySetAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  addDataSourceMethodology!: Sequelize.HasManyAddAssociationMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  addDataSourceMethodologies!: Sequelize.HasManyAddAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  createDataSourceMethodology!: Sequelize.HasManyCreateAssociationMixin<DataSourceMethodology>;
  removeDataSourceMethodology!: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  removeDataSourceMethodologies!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  hasDataSourceMethodology!: Sequelize.HasManyHasAssociationMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  hasDataSourceMethodologies!: Sequelize.HasManyHasAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  countDataSourceMethodologies!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceReportingLevel via datasourceId
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
  // DataSource hasMany DataSourceScope via datasourceId
  dataSourceScopes!: DataSourceScope[];
  getDataSourceScopes!: Sequelize.HasManyGetAssociationsMixin<DataSourceScope>;
  setDataSourceScopes!: Sequelize.HasManySetAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  addDataSourceScope!: Sequelize.HasManyAddAssociationMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  addDataSourceScopes!: Sequelize.HasManyAddAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  createDataSourceScope!: Sequelize.HasManyCreateAssociationMixin<DataSourceScope>;
  removeDataSourceScope!: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  removeDataSourceScopes!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  hasDataSourceScope!: Sequelize.HasManyHasAssociationMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  hasDataSourceScopes!: Sequelize.HasManyHasAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  countDataSourceScopes!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceSector via datasourceId
  dataSourceSectors!: DataSourceSector[];
  getDataSourceSectors!: Sequelize.HasManyGetAssociationsMixin<DataSourceSector>;
  setDataSourceSectors!: Sequelize.HasManySetAssociationsMixin<
    DataSourceSector,
    DataSourceSectorId
  >;
  addDataSourceSector!: Sequelize.HasManyAddAssociationMixin<
    DataSourceSector,
    DataSourceSectorId
  >;
  addDataSourceSectors!: Sequelize.HasManyAddAssociationsMixin<
    DataSourceSector,
    DataSourceSectorId
  >;
  createDataSourceSector!: Sequelize.HasManyCreateAssociationMixin<DataSourceSector>;
  removeDataSourceSector!: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceSector,
    DataSourceSectorId
  >;
  removeDataSourceSectors!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceSector,
    DataSourceSectorId
  >;
  hasDataSourceSector!: Sequelize.HasManyHasAssociationMixin<
    DataSourceSector,
    DataSourceSectorId
  >;
  hasDataSourceSectors!: Sequelize.HasManyHasAssociationsMixin<
    DataSourceSector,
    DataSourceSectorId
  >;
  countDataSourceSectors!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceSubCategory via datasourceId
  dataSourceSubCategories!: DataSourceSubCategory[];
  getDataSourceSubCategories!: Sequelize.HasManyGetAssociationsMixin<DataSourceSubCategory>;
  setDataSourceSubCategories!: Sequelize.HasManySetAssociationsMixin<
    DataSourceSubCategory,
    DataSourceSubCategoryId
  >;
  addDataSourceSubCategory!: Sequelize.HasManyAddAssociationMixin<
    DataSourceSubCategory,
    DataSourceSubCategoryId
  >;
  addDataSourceSubCategories!: Sequelize.HasManyAddAssociationsMixin<
    DataSourceSubCategory,
    DataSourceSubCategoryId
  >;
  createDataSourceSubCategory!: Sequelize.HasManyCreateAssociationMixin<DataSourceSubCategory>;
  removeDataSourceSubCategory!: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceSubCategory,
    DataSourceSubCategoryId
  >;
  removeDataSourceSubCategories!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceSubCategory,
    DataSourceSubCategoryId
  >;
  hasDataSourceSubCategory!: Sequelize.HasManyHasAssociationMixin<
    DataSourceSubCategory,
    DataSourceSubCategoryId
  >;
  hasDataSourceSubCategories!: Sequelize.HasManyHasAssociationsMixin<
    DataSourceSubCategory,
    DataSourceSubCategoryId
  >;
  countDataSourceSubCategories!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceSubSector via datasourceId
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
  // DataSource belongsToMany EmissionsFactor via datasourceId and emissionsFactorId
  emissionsFactorIdEmissionsFactors!: EmissionsFactor[];
  getEmissionsFactorIdEmissionsFactors!: Sequelize.BelongsToManyGetAssociationsMixin<EmissionsFactor>;
  setEmissionsFactorIdEmissionsFactors!: Sequelize.BelongsToManySetAssociationsMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  addEmissionsFactorIdEmissionsFactor!: Sequelize.BelongsToManyAddAssociationMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  addEmissionsFactorIdEmissionsFactors!: Sequelize.BelongsToManyAddAssociationsMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  createEmissionsFactorIdEmissionsFactor!: Sequelize.BelongsToManyCreateAssociationMixin<EmissionsFactor>;
  removeEmissionsFactorIdEmissionsFactor!: Sequelize.BelongsToManyRemoveAssociationMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  removeEmissionsFactorIdEmissionsFactors!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  hasEmissionsFactorIdEmissionsFactor!: Sequelize.BelongsToManyHasAssociationMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  hasEmissionsFactorIdEmissionsFactors!: Sequelize.BelongsToManyHasAssociationsMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  countEmissionsFactorIdEmissionsFactors!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource hasMany GDP via datasourceId
  gdps!: GDP[];
  getGdps!: Sequelize.HasManyGetAssociationsMixin<GDP>;
  setGdps!: Sequelize.HasManySetAssociationsMixin<GDP, GDPId>;
  addGdp!: Sequelize.HasManyAddAssociationMixin<GDP, GDPId>;
  addGdps!: Sequelize.HasManyAddAssociationsMixin<GDP, GDPId>;
  createGdp!: Sequelize.HasManyCreateAssociationMixin<GDP>;
  removeGdp!: Sequelize.HasManyRemoveAssociationMixin<GDP, GDPId>;
  removeGdps!: Sequelize.HasManyRemoveAssociationsMixin<GDP, GDPId>;
  hasGdp!: Sequelize.HasManyHasAssociationMixin<GDP, GDPId>;
  hasGdps!: Sequelize.HasManyHasAssociationsMixin<GDP, GDPId>;
  countGdps!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource belongsToMany GHGs via datasourceId and ghgId
  ghgIdGhgs!: GHGs[];
  getGhgIdGhgs!: Sequelize.BelongsToManyGetAssociationsMixin<GHGs>;
  setGhgIdGhgs!: Sequelize.BelongsToManySetAssociationsMixin<GHGs, GHGsId>;
  addGhgIdGhg!: Sequelize.BelongsToManyAddAssociationMixin<GHGs, GHGsId>;
  addGhgIdGhgs!: Sequelize.BelongsToManyAddAssociationsMixin<GHGs, GHGsId>;
  createGhgIdGhg!: Sequelize.BelongsToManyCreateAssociationMixin<GHGs>;
  removeGhgIdGhg!: Sequelize.BelongsToManyRemoveAssociationMixin<GHGs, GHGsId>;
  removeGhgIdGhgs!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    GHGs,
    GHGsId
  >;
  hasGhgIdGhg!: Sequelize.BelongsToManyHasAssociationMixin<GHGs, GHGsId>;
  hasGhgIdGhgs!: Sequelize.BelongsToManyHasAssociationsMixin<GHGs, GHGsId>;
  countGhgIdGhgs!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany Methodology via datasourceId and methodologyId
  methodologyIdMethodologies!: Methodology[];
  getMethodologyIdMethodologies!: Sequelize.BelongsToManyGetAssociationsMixin<Methodology>;
  setMethodologyIdMethodologies!: Sequelize.BelongsToManySetAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  addMethodologyIdMethodology!: Sequelize.BelongsToManyAddAssociationMixin<
    Methodology,
    MethodologyId
  >;
  addMethodologyIdMethodologies!: Sequelize.BelongsToManyAddAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  createMethodologyIdMethodology!: Sequelize.BelongsToManyCreateAssociationMixin<Methodology>;
  removeMethodologyIdMethodology!: Sequelize.BelongsToManyRemoveAssociationMixin<
    Methodology,
    MethodologyId
  >;
  removeMethodologyIdMethodologies!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  hasMethodologyIdMethodology!: Sequelize.BelongsToManyHasAssociationMixin<
    Methodology,
    MethodologyId
  >;
  hasMethodologyIdMethodologies!: Sequelize.BelongsToManyHasAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  countMethodologyIdMethodologies!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource hasMany Methodology via datasourceId
  methodologies!: Methodology[];
  getMethodologies!: Sequelize.HasManyGetAssociationsMixin<Methodology>;
  setMethodologies!: Sequelize.HasManySetAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  addMethodology!: Sequelize.HasManyAddAssociationMixin<
    Methodology,
    MethodologyId
  >;
  addMethodologies!: Sequelize.HasManyAddAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  createMethodology!: Sequelize.HasManyCreateAssociationMixin<Methodology>;
  removeMethodology!: Sequelize.HasManyRemoveAssociationMixin<
    Methodology,
    MethodologyId
  >;
  removeMethodologies!: Sequelize.HasManyRemoveAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  hasMethodology!: Sequelize.HasManyHasAssociationMixin<
    Methodology,
    MethodologyId
  >;
  hasMethodologies!: Sequelize.HasManyHasAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  countMethodologies!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany Population via datasourceId
  populations!: Population[];
  getPopulations!: Sequelize.HasManyGetAssociationsMixin<Population>;
  setPopulations!: Sequelize.HasManySetAssociationsMixin<
    Population,
    PopulationId
  >;
  addPopulation!: Sequelize.HasManyAddAssociationMixin<
    Population,
    PopulationId
  >;
  addPopulations!: Sequelize.HasManyAddAssociationsMixin<
    Population,
    PopulationId
  >;
  createPopulation!: Sequelize.HasManyCreateAssociationMixin<Population>;
  removePopulation!: Sequelize.HasManyRemoveAssociationMixin<
    Population,
    PopulationId
  >;
  removePopulations!: Sequelize.HasManyRemoveAssociationsMixin<
    Population,
    PopulationId
  >;
  hasPopulation!: Sequelize.HasManyHasAssociationMixin<
    Population,
    PopulationId
  >;
  hasPopulations!: Sequelize.HasManyHasAssociationsMixin<
    Population,
    PopulationId
  >;
  countPopulations!: Sequelize.HasManyCountAssociationsMixin;
  // DataSource belongsToMany ReportingLevel via datasourceId and reportinglevelId
  reportinglevelIdReportingLevels!: ReportingLevel[];
  getReportinglevelIdReportingLevels!: Sequelize.BelongsToManyGetAssociationsMixin<ReportingLevel>;
  setReportinglevelIdReportingLevels!: Sequelize.BelongsToManySetAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  addReportinglevelIdReportingLevel!: Sequelize.BelongsToManyAddAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  addReportinglevelIdReportingLevels!: Sequelize.BelongsToManyAddAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  createReportinglevelIdReportingLevel!: Sequelize.BelongsToManyCreateAssociationMixin<ReportingLevel>;
  removeReportinglevelIdReportingLevel!: Sequelize.BelongsToManyRemoveAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  removeReportinglevelIdReportingLevels!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  hasReportinglevelIdReportingLevel!: Sequelize.BelongsToManyHasAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  hasReportinglevelIdReportingLevels!: Sequelize.BelongsToManyHasAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  countReportinglevelIdReportingLevels!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany Scope via datasourceId and scopeId
  scopeIdScopes!: Scope[];
  getScopeIdScopes!: Sequelize.BelongsToManyGetAssociationsMixin<Scope>;
  setScopeIdScopes!: Sequelize.BelongsToManySetAssociationsMixin<
    Scope,
    ScopeId
  >;
  addScopeIdScope!: Sequelize.BelongsToManyAddAssociationMixin<Scope, ScopeId>;
  addScopeIdScopes!: Sequelize.BelongsToManyAddAssociationsMixin<
    Scope,
    ScopeId
  >;
  createScopeIdScope!: Sequelize.BelongsToManyCreateAssociationMixin<Scope>;
  removeScopeIdScope!: Sequelize.BelongsToManyRemoveAssociationMixin<
    Scope,
    ScopeId
  >;
  removeScopeIdScopes!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    Scope,
    ScopeId
  >;
  hasScopeIdScope!: Sequelize.BelongsToManyHasAssociationMixin<Scope, ScopeId>;
  hasScopeIdScopes!: Sequelize.BelongsToManyHasAssociationsMixin<
    Scope,
    ScopeId
  >;
  countScopeIdScopes!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany Sector via datasourceId and sectorId
  sectorIdSectors!: Sector[];
  getSectorIdSectors!: Sequelize.BelongsToManyGetAssociationsMixin<Sector>;
  setSectorIdSectors!: Sequelize.BelongsToManySetAssociationsMixin<
    Sector,
    SectorId
  >;
  addSectorIdSector!: Sequelize.BelongsToManyAddAssociationMixin<
    Sector,
    SectorId
  >;
  addSectorIdSectors!: Sequelize.BelongsToManyAddAssociationsMixin<
    Sector,
    SectorId
  >;
  createSectorIdSector!: Sequelize.BelongsToManyCreateAssociationMixin<Sector>;
  removeSectorIdSector!: Sequelize.BelongsToManyRemoveAssociationMixin<
    Sector,
    SectorId
  >;
  removeSectorIdSectors!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    Sector,
    SectorId
  >;
  hasSectorIdSector!: Sequelize.BelongsToManyHasAssociationMixin<
    Sector,
    SectorId
  >;
  hasSectorIdSectors!: Sequelize.BelongsToManyHasAssociationsMixin<
    Sector,
    SectorId
  >;
  countSectorIdSectors!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany SubCategory via datasourceId and subcategoryId
  subcategoryIdSubCategories!: SubCategory[];
  getSubcategoryIdSubCategories!: Sequelize.BelongsToManyGetAssociationsMixin<SubCategory>;
  setSubcategoryIdSubCategories!: Sequelize.BelongsToManySetAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  addSubcategoryIdSubCategory!: Sequelize.BelongsToManyAddAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  addSubcategoryIdSubCategories!: Sequelize.BelongsToManyAddAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  createSubcategoryIdSubCategory!: Sequelize.BelongsToManyCreateAssociationMixin<SubCategory>;
  removeSubcategoryIdSubCategory!: Sequelize.BelongsToManyRemoveAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  removeSubcategoryIdSubCategories!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  hasSubcategoryIdSubCategory!: Sequelize.BelongsToManyHasAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  hasSubcategoryIdSubCategories!: Sequelize.BelongsToManyHasAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  countSubcategoryIdSubCategories!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany SubSector via datasourceId and subsectorId
  subsectorIdSubSectors!: SubSector[];
  getSubsectorIdSubSectors!: Sequelize.BelongsToManyGetAssociationsMixin<SubSector>;
  setSubsectorIdSubSectors!: Sequelize.BelongsToManySetAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  addSubsectorIdSubSector!: Sequelize.BelongsToManyAddAssociationMixin<
    SubSector,
    SubSectorId
  >;
  addSubsectorIdSubSectors!: Sequelize.BelongsToManyAddAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  createSubsectorIdSubSector!: Sequelize.BelongsToManyCreateAssociationMixin<SubSector>;
  removeSubsectorIdSubSector!: Sequelize.BelongsToManyRemoveAssociationMixin<
    SubSector,
    SubSectorId
  >;
  removeSubsectorIdSubSectors!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  hasSubsectorIdSubSector!: Sequelize.BelongsToManyHasAssociationMixin<
    SubSector,
    SubSectorId
  >;
  hasSubsectorIdSubSectors!: Sequelize.BelongsToManyHasAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  countSubsectorIdSubSectors!: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsTo Publisher via publisherId
  publisher!: Publisher;
  getPublisher!: Sequelize.BelongsToGetAssociationMixin<Publisher>;
  setPublisher!: Sequelize.BelongsToSetAssociationMixin<Publisher, PublisherId>;
  createPublisher!: Sequelize.BelongsToCreateAssociationMixin<Publisher>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSource {
    return DataSource.init(
      {
        datasourceId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "datasource_id",
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        url: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "URL",
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        accessType: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "access_type",
        },
        geographicalLocation: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "geographical_location",
        },
        latestAccountingYear: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "latest_accounting_year",
        },
        frequencyOfUpdate: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "frequency_of_update",
        },
        spacialResolution: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "spacial_resolution",
        },
        language: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        accessibility: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        dataQuality: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "data_quality",
        },
        notes: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        units: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        methodologyUrl: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "methodology_url",
        },
        publisherId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "Publisher",
            key: "publisher_id",
          },
          field: "publisher_id",
        },
        retrievalMethod: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "retrieval_method",
        },
        apiEndpoint: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "api_endpoint",
        },
      },
      {
        sequelize,
        tableName: "DataSource",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "DataSource_pkey",
            unique: true,
            fields: [{ name: "datasource_id" }],
          },
        ],
      },
    );
  }
}
