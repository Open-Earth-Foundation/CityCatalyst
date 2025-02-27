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
import { InventoryValue, InventoryValueId } from "./InventoryValue";
import { ActivityValue, ActivityValueId } from "./ActivityValue";

export interface DataSourceI18nAttributes {
  datasourceId: string;
  datasetName?: Record<string, string>;
  datasourceName?: string;
  sourceType?: string;
  url?: string;
  datasetDescription?: Record<string, string>;
  accessType?: string;
  geographicalLocation?: string; // comma separated list of locodes for either EARTH, country, region or city
  startYear?: number; // inclusive
  endYear?: number; // inclusive
  latestAccountingYear?: number;
  frequencyOfUpdate?: string;
  spatialResolution?: string;
  language?: string;
  accessibility?: string;
  dataQuality?: string;
  notes?: string;
  units?: string;
  methodologyUrl?: string;
  methodologyDescription?: Record<string, string>;
  transformationDescription?: Record<string, string>;
  publisherId?: string;
  retrievalMethod?: string;
  apiEndpoint?: string;
  sectorId?: string;
  subsectorId?: string;
  subcategoryId?: string;
  created?: Date;
  lastUpdated?: Date;
  priority?: number; // 1-10, 10 being the highest priority
}

export type DataSourcePk = "datasourceId";
export type DataSourceId = DataSourceI18n[DataSourcePk];
export type DataSourceOptionalAttributes =
  | "datasetName"
  | "datasourceName"
  | "sourceType"
  | "url"
  | "datasetDescription"
  | "accessType"
  | "geographicalLocation"
  | "startYear"
  | "endYear"
  | "latestAccountingYear"
  | "frequencyOfUpdate"
  | "spatialResolution"
  | "language"
  | "accessibility"
  | "dataQuality"
  | "notes"
  | "units"
  | "methodologyUrl"
  | "methodologyDescription"
  | "transformationDescription"
  | "publisherId"
  | "retrievalMethod"
  | "apiEndpoint"
  | "sectorId"
  | "subsectorId"
  | "subcategoryId"
  | "priority"
  | "created"
  | "lastUpdated";
export type DataSourceI18nCreationAttributes = Optional<
  DataSourceI18nAttributes,
  DataSourceOptionalAttributes
>;

export class DataSourceI18n
  extends Model<DataSourceI18nAttributes, DataSourceI18nCreationAttributes>
  implements DataSourceI18nAttributes
{
  datasourceId!: string;
  datasetName?: Record<string, string>;
  datasourceName?: string;
  sourceType?: string;
  url?: string;
  datasetDescription?: Record<string, string>;
  accessType?: string;
  geographicalLocation?: string;
  startYear?: number; // inclusive
  endYear?: number; // inclusive
  latestAccountingYear?: number;
  frequencyOfUpdate?: string;
  spatialResolution?: string;
  language?: string;
  accessibility?: string;
  dataQuality?: string;
  notes?: string;
  units?: string;
  methodologyUrl?: string;
  methodologyDescription?: Record<string, string>;
  transformationDescription?: Record<string, string>;
  publisherId?: string;
  retrievalMethod?: string;
  apiEndpoint?: string;
  sectorId?: string;
  subsectorId?: string;
  subcategoryId?: string;
  priority?: number;
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
  // DataSource hasOne Sector via sectorId
  sector!: Sector;
  getSector!: Sequelize.HasOneGetAssociationMixin<Sector>;
  setSector!: Sequelize.HasOneSetAssociationMixin<Sector, SectorId>;
  createSector!: Sequelize.HasOneCreateAssociationMixin<Sector>;
  // DataSource hasOne SubCategory via subCategoryId
  subCategory!: SubCategory;
  getSubCategory!: Sequelize.HasOneGetAssociationMixin<SubCategory>;
  setSubCategory!: Sequelize.HasOneSetAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  createSubCategory!: Sequelize.HasOneCreateAssociationMixin<SubCategory>;
  // DataSource hasOneSubSector via subSectorId
  subSector!: SubSector;
  getSubSector!: Sequelize.HasOneGetAssociationMixin<SubSector>;
  setSubSector!: Sequelize.HasOneSetAssociationMixin<SubSector, SubSectorId>;
  createSubSector!: Sequelize.HasOneCreateAssociationMixin<SubSector>;
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
  scopes!: Scope[];
  getScopes!: Sequelize.BelongsToManyGetAssociationsMixin<Scope>;
  setScopes!: Sequelize.BelongsToManySetAssociationsMixin<Scope, ScopeId>;
  addScope!: Sequelize.BelongsToManyAddAssociationMixin<Scope, ScopeId>;
  addScopes!: Sequelize.BelongsToManyAddAssociationsMixin<Scope, ScopeId>;
  createScope!: Sequelize.BelongsToManyCreateAssociationMixin<Scope>;
  removeScope!: Sequelize.BelongsToManyRemoveAssociationMixin<Scope, ScopeId>;
  removeScopes!: Sequelize.BelongsToManyRemoveAssociationsMixin<Scope, ScopeId>;
  hasScope!: Sequelize.BelongsToManyHasAssociationMixin<Scope, ScopeId>;
  hasScopes!: Sequelize.BelongsToManyHasAssociationsMixin<Scope, ScopeId>;
  countScopes!: Sequelize.BelongsToManyCountAssociationsMixin;
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
  // DataSource hasMany InventoryValue via datasourceId
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
  // DataSource hasMany ActivityValue via datasourceId
  activityValues!: ActivityValue[];
  getActivityValues!: Sequelize.HasManyGetAssociationsMixin<ActivityValue>;
  setActivityValues!: Sequelize.HasManySetAssociationsMixin<
    ActivityValue,
    ActivityValueId
  >;
  addActivityValue!: Sequelize.HasManyAddAssociationMixin<
    ActivityValue,
    ActivityValueId
  >;
  addActivityValues!: Sequelize.HasManyAddAssociationsMixin<
    ActivityValue,
    ActivityValueId
  >;
  createActivityValue!: Sequelize.HasManyCreateAssociationMixin<ActivityValue>;
  removeActivityValue!: Sequelize.HasManyRemoveAssociationMixin<
    ActivityValue,
    ActivityValueId
  >;
  removeActivityValues!: Sequelize.HasManyRemoveAssociationsMixin<
    ActivityValue,
    ActivityValueId
  >;
  hasActivityValue!: Sequelize.HasManyHasAssociationMixin<
    ActivityValue,
    ActivityValueId
  >;
  hasActivityValues!: Sequelize.HasManyHasAssociationsMixin<
    ActivityValue,
    ActivityValueId
  >;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceI18n {
    return DataSourceI18n.init(
      {
        datasourceId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "datasource_id",
        },
        datasetName: {
          type: DataTypes.JSONB,
          allowNull: true,
          field: "dataset_name",
        },
        datasourceName: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "datasource_name",
        },
        sourceType: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "source_type",
        },
        url: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "URL",
        },
        datasetDescription: {
          type: DataTypes.JSONB,
          allowNull: true,
          field: "dataset_description",
        },
        accessType: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "access_type",
        },
        geographicalLocation: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "geographical_location",
        },
        startYear: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "start_year",
        },
        endYear: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "end_year",
        },
        latestAccountingYear: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "latest_accounting_year",
        },
        frequencyOfUpdate: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "frequency_of_update",
        },
        spatialResolution: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "spatial_resolution",
        },
        language: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        accessibility: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        dataQuality: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "data_quality",
        },
        notes: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        units: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        methodologyUrl: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "methodology_url",
        },
        methodologyDescription: {
          type: DataTypes.JSONB,
          allowNull: true,
          field: "methodology_description",
        },
        transformationDescription: {
          type: DataTypes.JSONB,
          allowNull: true,
          field: "transformation_description",
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
          type: DataTypes.TEXT,
          allowNull: true,
          field: "retrieval_method",
        },
        apiEndpoint: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "api_endpoint",
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
        subsectorId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "SubSector",
            key: "subsector_id",
          },
          field: "subsector_id",
        },
        subcategoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "SubCategory",
            key: "subcategory_id",
          },
          field: "subcategory_id",
        },
        priority: {
          type: DataTypes.DOUBLE,
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: "DataSourceI18n",
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
