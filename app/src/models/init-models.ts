import type { Sequelize } from "sequelize";
import { ActivityData as _ActivityData } from "./ActivityData";
import type { ActivityDataAttributes, ActivityDataCreationAttributes } from "./ActivityData";
import { DataSource as _DataSource } from "./DataSource";
import type { DataSourceAttributes, DataSourceCreationAttributes } from "./DataSource";
import { DataSourceActivityData as _DataSourceActivityData } from "./DataSourceActivityData";
import type { DataSourceActivityDataAttributes, DataSourceActivityDataCreationAttributes } from "./DataSourceActivityData";
import { DataSourceEmissionsFactor as _DataSourceEmissionsFactor } from "./DataSourceEmissionsFactor";
import type { DataSourceEmissionsFactorAttributes, DataSourceEmissionsFactorCreationAttributes } from "./DataSourceEmissionsFactor";
import { DataSourceGHGs as _DataSourceGHGs } from "./DataSourceGHGs";
import type { DataSourceGHGsAttributes, DataSourceGHGsCreationAttributes } from "./DataSourceGHGs";
import { DataSourceMethodology as _DataSourceMethodology } from "./DataSourceMethodology";
import type { DataSourceMethodologyAttributes, DataSourceMethodologyCreationAttributes } from "./DataSourceMethodology";
import { DataSourceReportingLevel as _DataSourceReportingLevel } from "./DataSourceReportingLevel";
import type { DataSourceReportingLevelAttributes, DataSourceReportingLevelCreationAttributes } from "./DataSourceReportingLevel";
import { DataSourceScope as _DataSourceScope } from "./DataSourceScope";
import type { DataSourceScopeAttributes, DataSourceScopeCreationAttributes } from "./DataSourceScope";
import { DataSourceSector as _DataSourceSector } from "./DataSourceSector";
import type { DataSourceSectorAttributes, DataSourceSectorCreationAttributes } from "./DataSourceSector";
import { DataSourceSubCategory as _DataSourceSubCategory } from "./DataSourceSubCategory";
import type { DataSourceSubCategoryAttributes, DataSourceSubCategoryCreationAttributes } from "./DataSourceSubCategory";
import { DataSourceSubSector as _DataSourceSubSector } from "./DataSourceSubSector";
import type { DataSourceSubSectorAttributes, DataSourceSubSectorCreationAttributes } from "./DataSourceSubSector";
import { EmissionsFactor as _EmissionsFactor } from "./EmissionsFactor";
import type { EmissionsFactorAttributes, EmissionsFactorCreationAttributes } from "./EmissionsFactor";
import { GHGs as _GHGs } from "./GHGs";
import type { GHGsAttributes, GHGsCreationAttributes } from "./GHGs";
import { Methodology as _Methodology } from "./Methodology";
import type { MethodologyAttributes, MethodologyCreationAttributes } from "./Methodology";
import { ReportingLevel as _ReportingLevel } from "./ReportingLevel";
import type { ReportingLevelAttributes, ReportingLevelCreationAttributes } from "./ReportingLevel";
import { Scope as _Scope } from "./Scope";
import type { ScopeAttributes, ScopeCreationAttributes } from "./Scope";
import { Sector as _Sector } from "./Sector";
import type { SectorAttributes, SectorCreationAttributes } from "./Sector";
import { SubCategory as _SubCategory } from "./SubCategory";
import type { SubCategoryAttributes, SubCategoryCreationAttributes } from "./SubCategory";
import { SubSector as _SubSector } from "./SubSector";
import type { SubSectorAttributes, SubSectorCreationAttributes } from "./SubSector";
import { User as _User } from "./User";
import type { UserAttributes, UserCreationAttributes } from "./User";

export {
  _ActivityData as ActivityData,
  _DataSource as DataSource,
  _DataSourceActivityData as DataSourceActivityData,
  _DataSourceEmissionsFactor as DataSourceEmissionsFactor,
  _DataSourceGHGs as DataSourceGHGs,
  _DataSourceMethodology as DataSourceMethodology,
  _DataSourceReportingLevel as DataSourceReportingLevel,
  _DataSourceScope as DataSourceScope,
  _DataSourceSector as DataSourceSector,
  _DataSourceSubCategory as DataSourceSubCategory,
  _DataSourceSubSector as DataSourceSubSector,
  _EmissionsFactor as EmissionsFactor,
  _GHGs as GHGs,
  _Methodology as Methodology,
  _ReportingLevel as ReportingLevel,
  _Scope as Scope,
  _Sector as Sector,
  _SubCategory as SubCategory,
  _SubSector as SubSector,
  _User as User,
};

export type {
  ActivityDataAttributes,
  ActivityDataCreationAttributes,
  DataSourceAttributes,
  DataSourceCreationAttributes,
  DataSourceActivityDataAttributes,
  DataSourceActivityDataCreationAttributes,
  DataSourceEmissionsFactorAttributes,
  DataSourceEmissionsFactorCreationAttributes,
  DataSourceGHGsAttributes,
  DataSourceGHGsCreationAttributes,
  DataSourceMethodologyAttributes,
  DataSourceMethodologyCreationAttributes,
  DataSourceReportingLevelAttributes,
  DataSourceReportingLevelCreationAttributes,
  DataSourceScopeAttributes,
  DataSourceScopeCreationAttributes,
  DataSourceSectorAttributes,
  DataSourceSectorCreationAttributes,
  DataSourceSubCategoryAttributes,
  DataSourceSubCategoryCreationAttributes,
  DataSourceSubSectorAttributes,
  DataSourceSubSectorCreationAttributes,
  EmissionsFactorAttributes,
  EmissionsFactorCreationAttributes,
  GHGsAttributes,
  GHGsCreationAttributes,
  MethodologyAttributes,
  MethodologyCreationAttributes,
  ReportingLevelAttributes,
  ReportingLevelCreationAttributes,
  ScopeAttributes,
  ScopeCreationAttributes,
  SectorAttributes,
  SectorCreationAttributes,
  SubCategoryAttributes,
  SubCategoryCreationAttributes,
  SubSectorAttributes,
  SubSectorCreationAttributes,
  UserAttributes,
  UserCreationAttributes,
};

export function initModels(sequelize: Sequelize) {
  const ActivityData = _ActivityData.initModel(sequelize);
  const DataSource = _DataSource.initModel(sequelize);
  const DataSourceActivityData = _DataSourceActivityData.initModel(sequelize);
  const DataSourceEmissionsFactor = _DataSourceEmissionsFactor.initModel(sequelize);
  const DataSourceGHGs = _DataSourceGHGs.initModel(sequelize);
  const DataSourceMethodology = _DataSourceMethodology.initModel(sequelize);
  const DataSourceReportingLevel = _DataSourceReportingLevel.initModel(sequelize);
  const DataSourceScope = _DataSourceScope.initModel(sequelize);
  const DataSourceSector = _DataSourceSector.initModel(sequelize);
  const DataSourceSubCategory = _DataSourceSubCategory.initModel(sequelize);
  const DataSourceSubSector = _DataSourceSubSector.initModel(sequelize);
  const EmissionsFactor = _EmissionsFactor.initModel(sequelize);
  const GHGs = _GHGs.initModel(sequelize);
  const Methodology = _Methodology.initModel(sequelize);
  const ReportingLevel = _ReportingLevel.initModel(sequelize);
  const Scope = _Scope.initModel(sequelize);
  const Sector = _Sector.initModel(sequelize);
  const SubCategory = _SubCategory.initModel(sequelize);
  const SubSector = _SubSector.initModel(sequelize);
  const User = _User.initModel(sequelize);

  ActivityData.belongsToMany(DataSource, { as: 'datasource_id_DataSources', through: DataSourceActivityData, foreignKey: "activitydata_id", otherKey: "datasource_id" });
  DataSource.belongsToMany(ActivityData, { as: 'activitydata_id_ActivityData', through: DataSourceActivityData, foreignKey: "datasource_id", otherKey: "activitydata_id" });
  DataSource.belongsToMany(EmissionsFactor, { as: 'emissions_factor_id_EmissionsFactors', through: DataSourceEmissionsFactor, foreignKey: "datasource_id", otherKey: "emissions_factor_id" });
  DataSource.belongsToMany(GHGs, { as: 'ghg_id_GHGs', through: DataSourceGHGs, foreignKey: "datasource_id", otherKey: "ghg_id" });
  DataSource.belongsToMany(Methodology, { as: 'methodology_id_Methodologies', through: DataSourceMethodology, foreignKey: "datasource_id", otherKey: "methodology_id" });
  DataSource.belongsToMany(ReportingLevel, { as: 'reportinglevel_id_ReportingLevels', through: DataSourceReportingLevel, foreignKey: "datasource_id", otherKey: "reportinglevel_id" });
  DataSource.belongsToMany(Scope, { as: 'scope_id_Scopes', through: DataSourceScope, foreignKey: "datasource_id", otherKey: "scope_id" });
  DataSource.belongsToMany(Sector, { as: 'sector_id_Sectors', through: DataSourceSector, foreignKey: "datasource_id", otherKey: "sector_id" });
  DataSource.belongsToMany(SubCategory, { as: 'subcategory_id_SubCategories', through: DataSourceSubCategory, foreignKey: "datasource_id", otherKey: "subcategory_id" });
  DataSource.belongsToMany(SubSector, { as: 'subsector_id_SubSectors', through: DataSourceSubSector, foreignKey: "datasource_id", otherKey: "subsector_id" });
  EmissionsFactor.belongsToMany(DataSource, { as: 'datasource_id_DataSource_DataSourceEmissionsFactors', through: DataSourceEmissionsFactor, foreignKey: "emissions_factor_id", otherKey: "datasource_id" });
  GHGs.belongsToMany(DataSource, { as: 'datasource_id_DataSource_DataSourceGHGs', through: DataSourceGHGs, foreignKey: "ghg_id", otherKey: "datasource_id" });
  Methodology.belongsToMany(DataSource, { as: 'datasource_id_DataSource_DataSourceMethodologies', through: DataSourceMethodology, foreignKey: "methodology_id", otherKey: "datasource_id" });
  ReportingLevel.belongsToMany(DataSource, { as: 'datasource_id_DataSource_DataSourceReportingLevels', through: DataSourceReportingLevel, foreignKey: "reportinglevel_id", otherKey: "datasource_id" });
  Scope.belongsToMany(DataSource, { as: 'datasource_id_DataSource_DataSourceScopes', through: DataSourceScope, foreignKey: "scope_id", otherKey: "datasource_id" });
  Sector.belongsToMany(DataSource, { as: 'datasource_id_DataSource_DataSourceSectors', through: DataSourceSector, foreignKey: "sector_id", otherKey: "datasource_id" });
  SubCategory.belongsToMany(DataSource, { as: 'datasource_id_DataSource_DataSourceSubCategories', through: DataSourceSubCategory, foreignKey: "subcategory_id", otherKey: "datasource_id" });
  SubSector.belongsToMany(DataSource, { as: 'datasource_id_DataSource_DataSourceSubSectors', through: DataSourceSubSector, foreignKey: "subsector_id", otherKey: "datasource_id" });
  DataSourceActivityData.belongsTo(ActivityData, { as: "activitydatum", foreignKey: "activitydata_id"});
  ActivityData.hasMany(DataSourceActivityData, { as: "DataSourceActivityData", foreignKey: "activitydata_id"});
  DataSourceActivityData.belongsTo(DataSource, { as: "datasource", foreignKey: "datasource_id"});
  DataSource.hasMany(DataSourceActivityData, { as: "DataSourceActivityData", foreignKey: "datasource_id"});
  DataSourceEmissionsFactor.belongsTo(DataSource, { as: "datasource", foreignKey: "datasource_id"});
  DataSource.hasMany(DataSourceEmissionsFactor, { as: "DataSourceEmissionsFactors", foreignKey: "datasource_id"});
  DataSourceGHGs.belongsTo(DataSource, { as: "datasource", foreignKey: "datasource_id"});
  DataSource.hasMany(DataSourceGHGs, { as: "DataSourceGHGs", foreignKey: "datasource_id"});
  DataSourceMethodology.belongsTo(DataSource, { as: "datasource", foreignKey: "datasource_id"});
  DataSource.hasMany(DataSourceMethodology, { as: "DataSourceMethodologies", foreignKey: "datasource_id"});
  DataSourceReportingLevel.belongsTo(DataSource, { as: "datasource", foreignKey: "datasource_id"});
  DataSource.hasMany(DataSourceReportingLevel, { as: "DataSourceReportingLevels", foreignKey: "datasource_id"});
  DataSourceScope.belongsTo(DataSource, { as: "datasource", foreignKey: "datasource_id"});
  DataSource.hasMany(DataSourceScope, { as: "DataSourceScopes", foreignKey: "datasource_id"});
  DataSourceSector.belongsTo(DataSource, { as: "datasource", foreignKey: "datasource_id"});
  DataSource.hasMany(DataSourceSector, { as: "DataSourceSectors", foreignKey: "datasource_id"});
  DataSourceSubCategory.belongsTo(DataSource, { as: "datasource", foreignKey: "datasource_id"});
  DataSource.hasMany(DataSourceSubCategory, { as: "DataSourceSubCategories", foreignKey: "datasource_id"});
  DataSourceSubSector.belongsTo(DataSource, { as: "datasource", foreignKey: "datasource_id"});
  DataSource.hasMany(DataSourceSubSector, { as: "DataSourceSubSectors", foreignKey: "datasource_id"});
  DataSourceEmissionsFactor.belongsTo(EmissionsFactor, { as: "emissions_factor", foreignKey: "emissions_factor_id"});
  EmissionsFactor.hasMany(DataSourceEmissionsFactor, { as: "DataSourceEmissionsFactors", foreignKey: "emissions_factor_id"});
  DataSourceGHGs.belongsTo(GHGs, { as: "ghg", foreignKey: "ghg_id"});
  GHGs.hasMany(DataSourceGHGs, { as: "DataSourceGHGs", foreignKey: "ghg_id"});
  DataSourceMethodology.belongsTo(Methodology, { as: "methodology", foreignKey: "methodology_id"});
  Methodology.hasMany(DataSourceMethodology, { as: "DataSourceMethodologies", foreignKey: "methodology_id"});
  ActivityData.belongsTo(ReportingLevel, { as: "reportinglevel", foreignKey: "reportinglevel_id"});
  ReportingLevel.hasMany(ActivityData, { as: "ActivityData", foreignKey: "reportinglevel_id"});
  DataSourceReportingLevel.belongsTo(ReportingLevel, { as: "reportinglevel", foreignKey: "reportinglevel_id"});
  ReportingLevel.hasMany(DataSourceReportingLevel, { as: "DataSourceReportingLevels", foreignKey: "reportinglevel_id"});
  ActivityData.belongsTo(Scope, { as: "scope", foreignKey: "scope_id"});
  Scope.hasMany(ActivityData, { as: "ActivityData", foreignKey: "scope_id"});
  DataSourceScope.belongsTo(Scope, { as: "scope", foreignKey: "scope_id"});
  Scope.hasMany(DataSourceScope, { as: "DataSourceScopes", foreignKey: "scope_id"});
  DataSourceSector.belongsTo(Sector, { as: "sector", foreignKey: "sector_id"});
  Sector.hasMany(DataSourceSector, { as: "DataSourceSectors", foreignKey: "sector_id"});
  SubSector.belongsTo(Sector, { as: "sector", foreignKey: "sector_id"});
  Sector.hasMany(SubSector, { as: "SubSectors", foreignKey: "sector_id"});
  ActivityData.belongsTo(SubCategory, { as: "subcategory", foreignKey: "subcategory_id"});
  SubCategory.hasMany(ActivityData, { as: "ActivityData", foreignKey: "subcategory_id"});
  DataSourceSubCategory.belongsTo(SubCategory, { as: "subcategory", foreignKey: "subcategory_id"});
  SubCategory.hasMany(DataSourceSubCategory, { as: "DataSourceSubCategories", foreignKey: "subcategory_id"});
  DataSourceSubSector.belongsTo(SubSector, { as: "subsector", foreignKey: "subsector_id"});
  SubSector.hasMany(DataSourceSubSector, { as: "DataSourceSubSectors", foreignKey: "subsector_id"});
  SubCategory.belongsTo(SubSector, { as: "subsector", foreignKey: "subsector_id"});
  SubSector.hasMany(SubCategory, { as: "SubCategories", foreignKey: "subsector_id"});
  User.belongsTo(User, { as: "organization", foreignKey: "organization_id"});
  User.hasMany(User, { as: "Users", foreignKey: "organization_id"});

  return {
    ActivityData: ActivityData,
    DataSource: DataSource,
    DataSourceActivityData: DataSourceActivityData,
    DataSourceEmissionsFactor: DataSourceEmissionsFactor,
    DataSourceGHGs: DataSourceGHGs,
    DataSourceMethodology: DataSourceMethodology,
    DataSourceReportingLevel: DataSourceReportingLevel,
    DataSourceScope: DataSourceScope,
    DataSourceSector: DataSourceSector,
    DataSourceSubCategory: DataSourceSubCategory,
    DataSourceSubSector: DataSourceSubSector,
    EmissionsFactor: EmissionsFactor,
    GHGs: GHGs,
    Methodology: Methodology,
    ReportingLevel: ReportingLevel,
    Scope: Scope,
    Sector: Sector,
    SubCategory: SubCategory,
    SubSector: SubSector,
    User: User,
  };
}
