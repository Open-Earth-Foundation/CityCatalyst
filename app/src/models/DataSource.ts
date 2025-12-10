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

export interface DataSourceAttributes {
  datasourceId: string;
  datasetName?: string;
  datasourceName?: string;
  sourceType?: string;
  url?: string;
  datasetDescription?: string;
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
  methodologyDescription?: string;
  transformationDescription?: string;
  publisherId?: string;
  retrievalMethod?: string;
  apiEndpoint?: string;
  sectorId?: string;
  subsectorId?: string;
  subcategoryId?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type DataSourcePk = "datasourceId";
export type DataSourceId = DataSource[DataSourcePk];
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
  | "created"
  | "lastUpdated";
export type DataSourceCreationAttributes = Optional<
  DataSourceAttributes,
  DataSourceOptionalAttributes
>;

export class DataSource
  extends Model<DataSourceAttributes, DataSourceCreationAttributes>
  implements Partial<DataSourceAttributes>
{
  declare datasourceId: string;
  declare datasetName?: string;
  declare datasourceName?: string;
  declare sourceType?: string;
  declare url?: string;
  declare datasetDescription?: string;
  declare accessType?: string;
  declare geographicalLocation?: string;
  declare startYear?: number; // inclusive
  declare endYear?: number; // inclusive
  declare latestAccountingYear?: number;
  declare frequencyOfUpdate?: string;
  declare spatialResolution?: string;
  declare language?: string;
  declare accessibility?: string;
  declare dataQuality?: string;
  declare notes?: string;
  declare units?: string;
  declare methodologyUrl?: string;
  declare methodologyDescription?: string;
  declare transformationDescription?: string;
  declare publisherId?: string;
  declare retrievalMethod?: string;
  declare apiEndpoint?: string;
  declare sectorId?: string;
  declare subsectorId?: string;
  declare subcategoryId?: string;
  declare created?: Date;
  declare lastUpdated?: Date;

  // DataSource belongsToMany ActivityData via datasourceId and activitydataId
  declare activitydataIdActivityData: ActivityData[];
  declare getActivitydataIdActivityData: Sequelize.BelongsToManyGetAssociationsMixin<ActivityData>;
  declare setActivitydataIdActivityData: Sequelize.BelongsToManySetAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  declare addActivitydataIdActivityDatum: Sequelize.BelongsToManyAddAssociationMixin<
    ActivityData,
    ActivityDataId
  >;
  declare addActivitydataIdActivityData: Sequelize.BelongsToManyAddAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  declare createActivitydataIdActivityDatum: Sequelize.BelongsToManyCreateAssociationMixin<ActivityData>;
  declare removeActivitydataIdActivityDatum: Sequelize.BelongsToManyRemoveAssociationMixin<
    ActivityData,
    ActivityDataId
  >;
  declare removeActivitydataIdActivityData: Sequelize.BelongsToManyRemoveAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  declare hasActivitydataIdActivityDatum: Sequelize.BelongsToManyHasAssociationMixin<
    ActivityData,
    ActivityDataId
  >;
  declare hasActivitydataIdActivityData: Sequelize.BelongsToManyHasAssociationsMixin<
    ActivityData,
    ActivityDataId
  >;
  declare countActivitydataIdActivityData: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource hasMany DataSourceActivityData via datasourceId
  declare dataSourceActivityData: DataSourceActivityData[];
  declare getDataSourceActivityData: Sequelize.HasManyGetAssociationsMixin<DataSourceActivityData>;
  declare setDataSourceActivityData: Sequelize.HasManySetAssociationsMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare addDataSourceActivityDatum: Sequelize.HasManyAddAssociationMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare addDataSourceActivityData: Sequelize.HasManyAddAssociationsMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare createDataSourceActivityDatum: Sequelize.HasManyCreateAssociationMixin<DataSourceActivityData>;
  declare removeDataSourceActivityDatum: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare removeDataSourceActivityData: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare hasDataSourceActivityDatum: Sequelize.HasManyHasAssociationMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare hasDataSourceActivityData: Sequelize.HasManyHasAssociationsMixin<
    DataSourceActivityData,
    DataSourceActivityDataId
  >;
  declare countDataSourceActivityData: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceEmissionsFactor via datasourceId
  declare dataSourceEmissionsFactors: DataSourceEmissionsFactor[];
  declare getDataSourceEmissionsFactors: Sequelize.HasManyGetAssociationsMixin<DataSourceEmissionsFactor>;
  declare setDataSourceEmissionsFactors: Sequelize.HasManySetAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare addDataSourceEmissionsFactor: Sequelize.HasManyAddAssociationMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare addDataSourceEmissionsFactors: Sequelize.HasManyAddAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare createDataSourceEmissionsFactor: Sequelize.HasManyCreateAssociationMixin<DataSourceEmissionsFactor>;
  declare removeDataSourceEmissionsFactor: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare removeDataSourceEmissionsFactors: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare hasDataSourceEmissionsFactor: Sequelize.HasManyHasAssociationMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare hasDataSourceEmissionsFactors: Sequelize.HasManyHasAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare countDataSourceEmissionsFactors: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceGHGs via datasourceId
  declare dataSourceGhgs: DataSourceGHGs[];
  declare getDataSourceGhgs: Sequelize.HasManyGetAssociationsMixin<DataSourceGHGs>;
  declare setDataSourceGhgs: Sequelize.HasManySetAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare addDataSourceGhg: Sequelize.HasManyAddAssociationMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare addDataSourceGhgs: Sequelize.HasManyAddAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare createDataSourceGhg: Sequelize.HasManyCreateAssociationMixin<DataSourceGHGs>;
  declare removeDataSourceGhg: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare removeDataSourceGhgs: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare hasDataSourceGhg: Sequelize.HasManyHasAssociationMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare hasDataSourceGhgs: Sequelize.HasManyHasAssociationsMixin<
    DataSourceGHGs,
    DataSourceGHGsId
  >;
  declare countDataSourceGhgs: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceMethodology via datasourceId
  declare dataSourceMethodologies: DataSourceMethodology[];
  declare getDataSourceMethodologies: Sequelize.HasManyGetAssociationsMixin<DataSourceMethodology>;
  declare setDataSourceMethodologies: Sequelize.HasManySetAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare addDataSourceMethodology: Sequelize.HasManyAddAssociationMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare addDataSourceMethodologies: Sequelize.HasManyAddAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare createDataSourceMethodology: Sequelize.HasManyCreateAssociationMixin<DataSourceMethodology>;
  declare removeDataSourceMethodology: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare removeDataSourceMethodologies: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare hasDataSourceMethodology: Sequelize.HasManyHasAssociationMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare hasDataSourceMethodologies: Sequelize.HasManyHasAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare countDataSourceMethodologies: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany DataSourceReportingLevel via datasourceId
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
  // DataSource hasMany DataSourceScope via datasourceId
  declare dataSourceScopes: DataSourceScope[];
  declare getDataSourceScopes: Sequelize.HasManyGetAssociationsMixin<DataSourceScope>;
  declare setDataSourceScopes: Sequelize.HasManySetAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare addDataSourceScope: Sequelize.HasManyAddAssociationMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare addDataSourceScopes: Sequelize.HasManyAddAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare createDataSourceScope: Sequelize.HasManyCreateAssociationMixin<DataSourceScope>;
  declare removeDataSourceScope: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare removeDataSourceScopes: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare hasDataSourceScope: Sequelize.HasManyHasAssociationMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare hasDataSourceScopes: Sequelize.HasManyHasAssociationsMixin<
    DataSourceScope,
    DataSourceScopeId
  >;
  declare countDataSourceScopes: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasOne Sector via sectorId
  declare sector: Sector;
  declare getSector: Sequelize.HasOneGetAssociationMixin<Sector>;
  declare setSector: Sequelize.HasOneSetAssociationMixin<Sector, SectorId>;
  declare createSector: Sequelize.HasOneCreateAssociationMixin<Sector>;
  // DataSource hasOne SubCategory via subCategoryId
  declare subCategory: SubCategory;
  declare getSubCategory: Sequelize.HasOneGetAssociationMixin<SubCategory>;
  declare setSubCategory: Sequelize.HasOneSetAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  declare createSubCategory: Sequelize.HasOneCreateAssociationMixin<SubCategory>;
  // DataSource hasOneSubSector via subSectorId
  declare subSector: SubSector;
  declare getSubSector: Sequelize.HasOneGetAssociationMixin<SubSector>;
  declare setSubSector: Sequelize.HasOneSetAssociationMixin<SubSector, SubSectorId>;
  declare createSubSector: Sequelize.HasOneCreateAssociationMixin<SubSector>;
  // DataSource belongsToMany EmissionsFactor via datasourceId and emissionsFactorId
  declare emissionsFactorIdEmissionsFactors: EmissionsFactor[];
  declare getEmissionsFactorIdEmissionsFactors: Sequelize.BelongsToManyGetAssociationsMixin<EmissionsFactor>;
  declare setEmissionsFactorIdEmissionsFactors: Sequelize.BelongsToManySetAssociationsMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  declare addEmissionsFactorIdEmissionsFactor: Sequelize.BelongsToManyAddAssociationMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  declare addEmissionsFactorIdEmissionsFactors: Sequelize.BelongsToManyAddAssociationsMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  declare createEmissionsFactorIdEmissionsFactor: Sequelize.BelongsToManyCreateAssociationMixin<EmissionsFactor>;
  declare removeEmissionsFactorIdEmissionsFactor: Sequelize.BelongsToManyRemoveAssociationMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  declare removeEmissionsFactorIdEmissionsFactors: Sequelize.BelongsToManyRemoveAssociationsMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  declare hasEmissionsFactorIdEmissionsFactor: Sequelize.BelongsToManyHasAssociationMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  declare hasEmissionsFactorIdEmissionsFactors: Sequelize.BelongsToManyHasAssociationsMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  declare countEmissionsFactorIdEmissionsFactors: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource hasMany GDP via datasourceId
  declare gdps: GDP[];
  declare getGdps: Sequelize.HasManyGetAssociationsMixin<GDP>;
  declare setGdps: Sequelize.HasManySetAssociationsMixin<GDP, GDPId>;
  declare addGdp: Sequelize.HasManyAddAssociationMixin<GDP, GDPId>;
  declare addGdps: Sequelize.HasManyAddAssociationsMixin<GDP, GDPId>;
  declare createGdp: Sequelize.HasManyCreateAssociationMixin<GDP>;
  declare removeGdp: Sequelize.HasManyRemoveAssociationMixin<GDP, GDPId>;
  declare removeGdps: Sequelize.HasManyRemoveAssociationsMixin<GDP, GDPId>;
  declare hasGdp: Sequelize.HasManyHasAssociationMixin<GDP, GDPId>;
  declare hasGdps: Sequelize.HasManyHasAssociationsMixin<GDP, GDPId>;
  declare countGdps: Sequelize.HasManyCountAssociationsMixin;
  // DataSource belongsToMany GHGs via datasourceId and ghgId
  declare ghgIdGhgs: GHGs[];
  declare getGhgIdGhgs: Sequelize.BelongsToManyGetAssociationsMixin<GHGs>;
  declare setGhgIdGhgs: Sequelize.BelongsToManySetAssociationsMixin<GHGs, GHGsId>;
  declare addGhgIdGhg: Sequelize.BelongsToManyAddAssociationMixin<GHGs, GHGsId>;
  declare addGhgIdGhgs: Sequelize.BelongsToManyAddAssociationsMixin<GHGs, GHGsId>;
  declare createGhgIdGhg: Sequelize.BelongsToManyCreateAssociationMixin<GHGs>;
  declare removeGhgIdGhg: Sequelize.BelongsToManyRemoveAssociationMixin<GHGs, GHGsId>;
  declare removeGhgIdGhgs: Sequelize.BelongsToManyRemoveAssociationsMixin<
    GHGs,
    GHGsId
  >;
  declare hasGhgIdGhg: Sequelize.BelongsToManyHasAssociationMixin<GHGs, GHGsId>;
  declare hasGhgIdGhgs: Sequelize.BelongsToManyHasAssociationsMixin<GHGs, GHGsId>;
  declare countGhgIdGhgs: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany Methodology via datasourceId and methodologyId
  declare methodologyIdMethodologies: Methodology[];
  declare getMethodologyIdMethodologies: Sequelize.BelongsToManyGetAssociationsMixin<Methodology>;
  declare setMethodologyIdMethodologies: Sequelize.BelongsToManySetAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  declare addMethodologyIdMethodology: Sequelize.BelongsToManyAddAssociationMixin<
    Methodology,
    MethodologyId
  >;
  declare addMethodologyIdMethodologies: Sequelize.BelongsToManyAddAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  declare createMethodologyIdMethodology: Sequelize.BelongsToManyCreateAssociationMixin<Methodology>;
  declare removeMethodologyIdMethodology: Sequelize.BelongsToManyRemoveAssociationMixin<
    Methodology,
    MethodologyId
  >;
  declare removeMethodologyIdMethodologies: Sequelize.BelongsToManyRemoveAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  declare hasMethodologyIdMethodology: Sequelize.BelongsToManyHasAssociationMixin<
    Methodology,
    MethodologyId
  >;
  declare hasMethodologyIdMethodologies: Sequelize.BelongsToManyHasAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  declare countMethodologyIdMethodologies: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource hasMany Methodology via datasourceId
  declare methodologies: Methodology[];
  declare getMethodologies: Sequelize.HasManyGetAssociationsMixin<Methodology>;
  declare setMethodologies: Sequelize.HasManySetAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  declare addMethodology: Sequelize.HasManyAddAssociationMixin<
    Methodology,
    MethodologyId
  >;
  declare addMethodologies: Sequelize.HasManyAddAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  declare createMethodology: Sequelize.HasManyCreateAssociationMixin<Methodology>;
  declare removeMethodology: Sequelize.HasManyRemoveAssociationMixin<
    Methodology,
    MethodologyId
  >;
  declare removeMethodologies: Sequelize.HasManyRemoveAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  declare hasMethodology: Sequelize.HasManyHasAssociationMixin<
    Methodology,
    MethodologyId
  >;
  declare hasMethodologies: Sequelize.HasManyHasAssociationsMixin<
    Methodology,
    MethodologyId
  >;
  declare countMethodologies: Sequelize.HasManyCountAssociationsMixin;
  // DataSource hasMany Population via datasourceId
  declare populations: Population[];
  declare getPopulations: Sequelize.HasManyGetAssociationsMixin<Population>;
  declare setPopulations: Sequelize.HasManySetAssociationsMixin<
    Population,
    PopulationId
  >;
  declare addPopulation: Sequelize.HasManyAddAssociationMixin<
    Population,
    PopulationId
  >;
  declare addPopulations: Sequelize.HasManyAddAssociationsMixin<
    Population,
    PopulationId
  >;
  declare createPopulation: Sequelize.HasManyCreateAssociationMixin<Population>;
  declare removePopulation: Sequelize.HasManyRemoveAssociationMixin<
    Population,
    PopulationId
  >;
  declare removePopulations: Sequelize.HasManyRemoveAssociationsMixin<
    Population,
    PopulationId
  >;
  declare hasPopulation: Sequelize.HasManyHasAssociationMixin<
    Population,
    PopulationId
  >;
  declare hasPopulations: Sequelize.HasManyHasAssociationsMixin<
    Population,
    PopulationId
  >;
  declare countPopulations: Sequelize.HasManyCountAssociationsMixin;
  // DataSource belongsToMany ReportingLevel via datasourceId and reportinglevelId
  declare reportinglevelIdReportingLevels: ReportingLevel[];
  declare getReportinglevelIdReportingLevels: Sequelize.BelongsToManyGetAssociationsMixin<ReportingLevel>;
  declare setReportinglevelIdReportingLevels: Sequelize.BelongsToManySetAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare addReportinglevelIdReportingLevel: Sequelize.BelongsToManyAddAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare addReportinglevelIdReportingLevels: Sequelize.BelongsToManyAddAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare createReportinglevelIdReportingLevel: Sequelize.BelongsToManyCreateAssociationMixin<ReportingLevel>;
  declare removeReportinglevelIdReportingLevel: Sequelize.BelongsToManyRemoveAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare removeReportinglevelIdReportingLevels: Sequelize.BelongsToManyRemoveAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare hasReportinglevelIdReportingLevel: Sequelize.BelongsToManyHasAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare hasReportinglevelIdReportingLevels: Sequelize.BelongsToManyHasAssociationsMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare countReportinglevelIdReportingLevels: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany Scope via datasourceId and scopeId
  declare scopes: Scope[];
  declare getScopes: Sequelize.BelongsToManyGetAssociationsMixin<Scope>;
  declare setScopes: Sequelize.BelongsToManySetAssociationsMixin<Scope, ScopeId>;
  declare addScope: Sequelize.BelongsToManyAddAssociationMixin<Scope, ScopeId>;
  declare addScopes: Sequelize.BelongsToManyAddAssociationsMixin<Scope, ScopeId>;
  declare createScope: Sequelize.BelongsToManyCreateAssociationMixin<Scope>;
  declare removeScope: Sequelize.BelongsToManyRemoveAssociationMixin<Scope, ScopeId>;
  declare removeScopes: Sequelize.BelongsToManyRemoveAssociationsMixin<Scope, ScopeId>;
  declare hasScope: Sequelize.BelongsToManyHasAssociationMixin<Scope, ScopeId>;
  declare hasScopes: Sequelize.BelongsToManyHasAssociationsMixin<Scope, ScopeId>;
  declare countScopes: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany Sector via datasourceId and sectorId
  declare sectorIdSectors: Sector[];
  declare getSectorIdSectors: Sequelize.BelongsToManyGetAssociationsMixin<Sector>;
  declare setSectorIdSectors: Sequelize.BelongsToManySetAssociationsMixin<
    Sector,
    SectorId
  >;
  declare addSectorIdSector: Sequelize.BelongsToManyAddAssociationMixin<
    Sector,
    SectorId
  >;
  declare addSectorIdSectors: Sequelize.BelongsToManyAddAssociationsMixin<
    Sector,
    SectorId
  >;
  declare createSectorIdSector: Sequelize.BelongsToManyCreateAssociationMixin<Sector>;
  declare removeSectorIdSector: Sequelize.BelongsToManyRemoveAssociationMixin<
    Sector,
    SectorId
  >;
  declare removeSectorIdSectors: Sequelize.BelongsToManyRemoveAssociationsMixin<
    Sector,
    SectorId
  >;
  declare hasSectorIdSector: Sequelize.BelongsToManyHasAssociationMixin<
    Sector,
    SectorId
  >;
  declare hasSectorIdSectors: Sequelize.BelongsToManyHasAssociationsMixin<
    Sector,
    SectorId
  >;
  declare countSectorIdSectors: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany SubCategory via datasourceId and subcategoryId
  declare subcategoryIdSubCategories: SubCategory[];
  declare getSubcategoryIdSubCategories: Sequelize.BelongsToManyGetAssociationsMixin<SubCategory>;
  declare setSubcategoryIdSubCategories: Sequelize.BelongsToManySetAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  declare addSubcategoryIdSubCategory: Sequelize.BelongsToManyAddAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  declare addSubcategoryIdSubCategories: Sequelize.BelongsToManyAddAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  declare createSubcategoryIdSubCategory: Sequelize.BelongsToManyCreateAssociationMixin<SubCategory>;
  declare removeSubcategoryIdSubCategory: Sequelize.BelongsToManyRemoveAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  declare removeSubcategoryIdSubCategories: Sequelize.BelongsToManyRemoveAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  declare hasSubcategoryIdSubCategory: Sequelize.BelongsToManyHasAssociationMixin<
    SubCategory,
    SubCategoryId
  >;
  declare hasSubcategoryIdSubCategories: Sequelize.BelongsToManyHasAssociationsMixin<
    SubCategory,
    SubCategoryId
  >;
  declare countSubcategoryIdSubCategories: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsToMany SubSector via datasourceId and subsectorId
  declare subsectorIdSubSectors: SubSector[];
  declare getSubsectorIdSubSectors: Sequelize.BelongsToManyGetAssociationsMixin<SubSector>;
  declare setSubsectorIdSubSectors: Sequelize.BelongsToManySetAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  declare addSubsectorIdSubSector: Sequelize.BelongsToManyAddAssociationMixin<
    SubSector,
    SubSectorId
  >;
  declare addSubsectorIdSubSectors: Sequelize.BelongsToManyAddAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  declare createSubsectorIdSubSector: Sequelize.BelongsToManyCreateAssociationMixin<SubSector>;
  declare removeSubsectorIdSubSector: Sequelize.BelongsToManyRemoveAssociationMixin<
    SubSector,
    SubSectorId
  >;
  declare removeSubsectorIdSubSectors: Sequelize.BelongsToManyRemoveAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  declare hasSubsectorIdSubSector: Sequelize.BelongsToManyHasAssociationMixin<
    SubSector,
    SubSectorId
  >;
  declare hasSubsectorIdSubSectors: Sequelize.BelongsToManyHasAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  declare countSubsectorIdSubSectors: Sequelize.BelongsToManyCountAssociationsMixin;
  // DataSource belongsTo Publisher via publisherId
  declare publisher: Publisher;
  declare getPublisher: Sequelize.BelongsToGetAssociationMixin<Publisher>;
  declare setPublisher: Sequelize.BelongsToSetAssociationMixin<Publisher, PublisherId>;
  declare createPublisher: Sequelize.BelongsToCreateAssociationMixin<Publisher>;
  // DataSource hasMany InventoryValue via datasourceId
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
  // DataSource hasMany ActivityValue via datasourceId
  declare activityValues: ActivityValue[];
  declare getActivityValues: Sequelize.HasManyGetAssociationsMixin<ActivityValue>;
  declare setActivityValues: Sequelize.HasManySetAssociationsMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare addActivityValue: Sequelize.HasManyAddAssociationMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare addActivityValues: Sequelize.HasManyAddAssociationsMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare createActivityValue: Sequelize.HasManyCreateAssociationMixin<ActivityValue>;
  declare removeActivityValue: Sequelize.HasManyRemoveAssociationMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare removeActivityValues: Sequelize.HasManyRemoveAssociationsMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare hasActivityValue: Sequelize.HasManyHasAssociationMixin<
    ActivityValue,
    ActivityValueId
  >;
  declare hasActivityValues: Sequelize.HasManyHasAssociationsMixin<
    ActivityValue,
    ActivityValueId
  >;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSource {
    return DataSource.init(
      {
        datasourceId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "datasource_id",
        },
        datasetName: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "dataset_name",
        },
        datasourceName: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "datasource_name",
        },
        sourceType: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "source_type",
        },
        url: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "URL",
        },
        datasetDescription: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "dataset_description",
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
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "frequency_of_update",
        },
        spatialResolution: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "spatial_resolution",
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
        methodologyDescription: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "methodology_description",
        },
        transformationDescription: {
          type: DataTypes.TEXT,
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
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "retrieval_method",
        },
        apiEndpoint: {
          type: DataTypes.STRING(255),
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
