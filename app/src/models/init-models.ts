import type { Sequelize } from "sequelize";
import { ActivityData as _ActivityData } from "./ActivityData";
import type { ActivityDataAttributes, ActivityDataCreationAttributes } from "./ActivityData";
import { City as _City } from "./City";
import type { CityAttributes, CityCreationAttributes } from "./City";
import { CityUser as _CityUser } from "./CityUser";
import type { CityUserAttributes, CityUserCreationAttributes } from "./CityUser";
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
import { GDP as _GDP } from "./GDP";
import type { GDPAttributes, GDPCreationAttributes } from "./GDP";
import { GHGs as _GHGs } from "./GHGs";
import type { GHGsAttributes, GHGsCreationAttributes } from "./GHGs";
import { Inventory as _Inventory } from "./Inventory";
import type { InventoryAttributes, InventoryCreationAttributes } from "./Inventory";
import { Methodology as _Methodology } from "./Methodology";
import type { MethodologyAttributes, MethodologyCreationAttributes } from "./Methodology";
import { Population as _Population } from "./Population";
import type { PopulationAttributes, PopulationCreationAttributes } from "./Population";
import { Publisher as _Publisher } from "./Publisher";
import type { PublisherAttributes, PublisherCreationAttributes } from "./Publisher";
import { ReportingLevel as _ReportingLevel } from "./ReportingLevel";
import type { ReportingLevelAttributes, ReportingLevelCreationAttributes } from "./ReportingLevel";
import { Scope as _Scope } from "./Scope";
import type { ScopeAttributes, ScopeCreationAttributes } from "./Scope";
import { Sector as _Sector } from "./Sector";
import type { SectorAttributes, SectorCreationAttributes } from "./Sector";
import { SectorValue as _SectorValue } from "./SectorValue";
import type { SectorValueAttributes, SectorValueCreationAttributes } from "./SectorValue";
import { SubCategory as _SubCategory } from "./SubCategory";
import type { SubCategoryAttributes, SubCategoryCreationAttributes } from "./SubCategory";
import { SubCategoryValue as _SubCategoryValue } from "./SubCategoryValue";
import type { SubCategoryValueAttributes, SubCategoryValueCreationAttributes } from "./SubCategoryValue";
import { SubSector as _SubSector } from "./SubSector";
import type { SubSectorAttributes, SubSectorCreationAttributes } from "./SubSector";
import { SubSectorReportingLevel as _SubSectorReportingLevel } from "./SubSectorReportingLevel";
import type { SubSectorReportingLevelAttributes, SubSectorReportingLevelCreationAttributes } from "./SubSectorReportingLevel";
import { SubSectorScope as _SubSectorScope } from "./SubSectorScope";
import type { SubSectorScopeAttributes, SubSectorScopeCreationAttributes } from "./SubSectorScope";
import { SubSectorValue as _SubSectorValue } from "./SubSectorValue";
import type { SubSectorValueAttributes, SubSectorValueCreationAttributes } from "./SubSectorValue";
import { User as _User } from "./User";
import type { UserAttributes, UserCreationAttributes } from "./User";
import { Version as _Version } from "./Version";
import type { VersionAttributes, VersionCreationAttributes } from "./Version";

export {
  _ActivityData as ActivityData,
  _City as City,
  _CityUser as CityUser,
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
  _GDP as GDP,
  _GHGs as GHGs,
  _Inventory as Inventory,
  _Methodology as Methodology,
  _Population as Population,
  _Publisher as Publisher,
  _ReportingLevel as ReportingLevel,
  _Scope as Scope,
  _Sector as Sector,
  _SectorValue as SectorValue,
  _SubCategory as SubCategory,
  _SubCategoryValue as SubCategoryValue,
  _SubSector as SubSector,
  _SubSectorReportingLevel as SubSectorReportingLevel,
  _SubSectorScope as SubSectorScope,
  _SubSectorValue as SubSectorValue,
  _User as User,
  _Version as Version,
};

export type {
  ActivityDataAttributes,
  ActivityDataCreationAttributes,
  CityAttributes,
  CityCreationAttributes,
  CityUserAttributes,
  CityUserCreationAttributes,
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
  GDPAttributes,
  GDPCreationAttributes,
  GHGsAttributes,
  GHGsCreationAttributes,
  InventoryAttributes,
  InventoryCreationAttributes,
  MethodologyAttributes,
  MethodologyCreationAttributes,
  PopulationAttributes,
  PopulationCreationAttributes,
  PublisherAttributes,
  PublisherCreationAttributes,
  ReportingLevelAttributes,
  ReportingLevelCreationAttributes,
  ScopeAttributes,
  ScopeCreationAttributes,
  SectorAttributes,
  SectorCreationAttributes,
  SectorValueAttributes,
  SectorValueCreationAttributes,
  SubCategoryAttributes,
  SubCategoryCreationAttributes,
  SubCategoryValueAttributes,
  SubCategoryValueCreationAttributes,
  SubSectorAttributes,
  SubSectorCreationAttributes,
  SubSectorReportingLevelAttributes,
  SubSectorReportingLevelCreationAttributes,
  SubSectorScopeAttributes,
  SubSectorScopeCreationAttributes,
  SubSectorValueAttributes,
  SubSectorValueCreationAttributes,
  UserAttributes,
  UserCreationAttributes,
  VersionAttributes,
  VersionCreationAttributes,
};

export function initModels(sequelize: Sequelize) {
  const ActivityData = _ActivityData.initModel(sequelize);
  const City = _City.initModel(sequelize);
  const CityUser = _CityUser.initModel(sequelize);
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
  const GDP = _GDP.initModel(sequelize);
  const GHGs = _GHGs.initModel(sequelize);
  const Inventory = _Inventory.initModel(sequelize);
  const Methodology = _Methodology.initModel(sequelize);
  const Population = _Population.initModel(sequelize);
  const Publisher = _Publisher.initModel(sequelize);
  const ReportingLevel = _ReportingLevel.initModel(sequelize);
  const Scope = _Scope.initModel(sequelize);
  const Sector = _Sector.initModel(sequelize);
  const SectorValue = _SectorValue.initModel(sequelize);
  const SubCategory = _SubCategory.initModel(sequelize);
  const SubCategoryValue = _SubCategoryValue.initModel(sequelize);
  const SubSector = _SubSector.initModel(sequelize);
  const SubSectorReportingLevel = _SubSectorReportingLevel.initModel(sequelize);
  const SubSectorScope = _SubSectorScope.initModel(sequelize);
  const SubSectorValue = _SubSectorValue.initModel(sequelize);
  const User = _User.initModel(sequelize);
  const Version = _Version.initModel(sequelize);

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
  ReportingLevel.belongsToMany(SubSector, { as: 'subsector_id_SubSector_SubSectorReportingLevels', through: SubSectorReportingLevel, foreignKey: "reportinglevel_id", otherKey: "subsector_id" });
  Scope.belongsToMany(DataSource, { as: 'datasource_id_DataSource_DataSourceScopes', through: DataSourceScope, foreignKey: "scope_id", otherKey: "datasource_id" });
  Scope.belongsToMany(SubSector, { as: 'subsector_id_SubSector_SubSectorScopes', through: SubSectorScope, foreignKey: "scope_id", otherKey: "subsector_id" });
  Sector.belongsToMany(DataSource, { as: 'datasource_id_DataSource_DataSourceSectors', through: DataSourceSector, foreignKey: "sector_id", otherKey: "datasource_id" });
  SubCategory.belongsToMany(DataSource, { as: 'datasource_id_DataSource_DataSourceSubCategories', through: DataSourceSubCategory, foreignKey: "subcategory_id", otherKey: "datasource_id" });
  SubSector.belongsToMany(DataSource, { as: 'datasource_id_DataSource_DataSourceSubSectors', through: DataSourceSubSector, foreignKey: "subsector_id", otherKey: "datasource_id" });
  SubSector.belongsToMany(ReportingLevel, { as: 'reportinglevel_id_ReportingLevel_SubSectorReportingLevels', through: SubSectorReportingLevel, foreignKey: "subsector_id", otherKey: "reportinglevel_id" });
  SubSector.belongsToMany(Scope, { as: 'scope_id_Scope_SubSectorScopes', through: SubSectorScope, foreignKey: "subsector_id", otherKey: "scope_id" });
  DataSourceActivityData.belongsTo(ActivityData, { as: "activitydatum", foreignKey: "activitydata_id"});
  ActivityData.hasMany(DataSourceActivityData, { as: "DataSourceActivityData", foreignKey: "activitydata_id"});
  CityUser.belongsTo(City, { as: "city", foreignKey: "city_id"});
  City.hasMany(CityUser, { as: "CityUsers", foreignKey: "city_id"});
  GDP.belongsTo(City, { as: "city", foreignKey: "city_id"});
  City.hasMany(GDP, { as: "GDPs", foreignKey: "city_id"});
  Inventory.belongsTo(City, { as: "city", foreignKey: "city_id"});
  City.hasMany(Inventory, { as: "Inventories", foreignKey: "city_id"});
  Population.belongsTo(City, { as: "city", foreignKey: "city_id"});
  City.hasMany(Population, { as: "Populations", foreignKey: "city_id"});
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
  GDP.belongsTo(DataSource, { as: "datasource", foreignKey: "datasource_id"});
  DataSource.hasMany(GDP, { as: "GDPs", foreignKey: "datasource_id"});
  Methodology.belongsTo(DataSource, { as: "datasource", foreignKey: "datasource_id"});
  DataSource.hasMany(Methodology, { as: "Methodologies", foreignKey: "datasource_id"});
  Population.belongsTo(DataSource, { as: "datasource", foreignKey: "datasource_id"});
  DataSource.hasMany(Population, { as: "Populations", foreignKey: "datasource_id"});
  DataSourceEmissionsFactor.belongsTo(EmissionsFactor, { as: "emissions_factor", foreignKey: "emissions_factor_id"});
  EmissionsFactor.hasMany(DataSourceEmissionsFactor, { as: "DataSourceEmissionsFactors", foreignKey: "emissions_factor_id"});
  SubCategoryValue.belongsTo(EmissionsFactor, { as: "emissions_factor", foreignKey: "emissions_factor_id"});
  EmissionsFactor.hasMany(SubCategoryValue, { as: "SubCategoryValues", foreignKey: "emissions_factor_id"});
  SubSectorValue.belongsTo(EmissionsFactor, { as: "emissions_factor", foreignKey: "emissions_factor_id"});
  EmissionsFactor.hasMany(SubSectorValue, { as: "SubSectorValues", foreignKey: "emissions_factor_id"});
  DataSourceGHGs.belongsTo(GHGs, { as: "ghg", foreignKey: "ghg_id"});
  GHGs.hasMany(DataSourceGHGs, { as: "DataSourceGHGs", foreignKey: "ghg_id"});
  SectorValue.belongsTo(Inventory, { as: "inventory", foreignKey: "inventory_id"});
  Inventory.hasMany(SectorValue, { as: "SectorValues", foreignKey: "inventory_id"});
  SubCategoryValue.belongsTo(Inventory, { as: "inventory", foreignKey: "inventory_id"});
  Inventory.hasMany(SubCategoryValue, { as: "SubCategoryValues", foreignKey: "inventory_id"});
  SubSectorValue.belongsTo(Inventory, { as: "inventory", foreignKey: "inventory_id"});
  Inventory.hasMany(SubSectorValue, { as: "SubSectorValues", foreignKey: "inventory_id"});
  Version.belongsTo(Inventory, { as: "inventory", foreignKey: "inventory_id"});
  Inventory.hasMany(Version, { as: "Versions", foreignKey: "inventory_id"});
  DataSourceMethodology.belongsTo(Methodology, { as: "methodology", foreignKey: "methodology_id"});
  Methodology.hasMany(DataSourceMethodology, { as: "DataSourceMethodologies", foreignKey: "methodology_id"});
  DataSource.belongsTo(Publisher, { as: "publisher", foreignKey: "publisher_id"});
  Publisher.hasMany(DataSource, { as: "DataSources", foreignKey: "publisher_id"});
  ActivityData.belongsTo(ReportingLevel, { as: "reportinglevel", foreignKey: "reportinglevel_id"});
  ReportingLevel.hasMany(ActivityData, { as: "ActivityData", foreignKey: "reportinglevel_id"});
  DataSourceReportingLevel.belongsTo(ReportingLevel, { as: "reportinglevel", foreignKey: "reportinglevel_id"});
  ReportingLevel.hasMany(DataSourceReportingLevel, { as: "DataSourceReportingLevels", foreignKey: "reportinglevel_id"});
  SubCategory.belongsTo(ReportingLevel, { as: "reportinglevel", foreignKey: "reportinglevel_id"});
  ReportingLevel.hasMany(SubCategory, { as: "SubCategories", foreignKey: "reportinglevel_id"});
  SubSectorReportingLevel.belongsTo(ReportingLevel, { as: "reportinglevel", foreignKey: "reportinglevel_id"});
  ReportingLevel.hasMany(SubSectorReportingLevel, { as: "SubSectorReportingLevels", foreignKey: "reportinglevel_id"});
  ActivityData.belongsTo(Scope, { as: "scope", foreignKey: "scope_id"});
  Scope.hasMany(ActivityData, { as: "ActivityData", foreignKey: "scope_id"});
  DataSourceScope.belongsTo(Scope, { as: "scope", foreignKey: "scope_id"});
  Scope.hasMany(DataSourceScope, { as: "DataSourceScopes", foreignKey: "scope_id"});
  SubCategory.belongsTo(Scope, { as: "scope", foreignKey: "scope_id"});
  Scope.hasMany(SubCategory, { as: "SubCategories", foreignKey: "scope_id"});
  SubSectorScope.belongsTo(Scope, { as: "scope", foreignKey: "scope_id"});
  Scope.hasMany(SubSectorScope, { as: "SubSectorScopes", foreignKey: "scope_id"});
  DataSourceSector.belongsTo(Sector, { as: "sector", foreignKey: "sector_id"});
  Sector.hasMany(DataSourceSector, { as: "DataSourceSectors", foreignKey: "sector_id"});
  SectorValue.belongsTo(Sector, { as: "sector", foreignKey: "sector_id"});
  Sector.hasMany(SectorValue, { as: "SectorValues", foreignKey: "sector_id"});
  SubSector.belongsTo(Sector, { as: "sector", foreignKey: "sector_id"});
  Sector.hasMany(SubSector, { as: "SubSectors", foreignKey: "sector_id"});
  SubCategoryValue.belongsTo(SectorValue, { as: "sector_value", foreignKey: "sector_value_id"});
  SectorValue.hasMany(SubCategoryValue, { as: "SubCategoryValues", foreignKey: "sector_value_id"});
  SubSectorValue.belongsTo(SectorValue, { as: "sector_value", foreignKey: "sector_value_id"});
  SectorValue.hasMany(SubSectorValue, { as: "SubSectorValues", foreignKey: "sector_value_id"});
  ActivityData.belongsTo(SubCategory, { as: "subcategory", foreignKey: "subcategory_id"});
  SubCategory.hasMany(ActivityData, { as: "ActivityData", foreignKey: "subcategory_id"});
  DataSourceSubCategory.belongsTo(SubCategory, { as: "subcategory", foreignKey: "subcategory_id"});
  SubCategory.hasMany(DataSourceSubCategory, { as: "DataSourceSubCategories", foreignKey: "subcategory_id"});
  SubCategoryValue.belongsTo(SubCategory, { as: "subcategory", foreignKey: "subcategory_id"});
  SubCategory.hasMany(SubCategoryValue, { as: "SubCategoryValues", foreignKey: "subcategory_id"});
  DataSourceSubSector.belongsTo(SubSector, { as: "subsector", foreignKey: "subsector_id"});
  SubSector.hasMany(DataSourceSubSector, { as: "DataSourceSubSectors", foreignKey: "subsector_id"});
  SubCategory.belongsTo(SubSector, { as: "subsector", foreignKey: "subsector_id"});
  SubSector.hasMany(SubCategory, { as: "SubCategories", foreignKey: "subsector_id"});
  SubSectorReportingLevel.belongsTo(SubSector, { as: "subsector", foreignKey: "subsector_id"});
  SubSector.hasMany(SubSectorReportingLevel, { as: "SubSectorReportingLevels", foreignKey: "subsector_id"});
  SubSectorScope.belongsTo(SubSector, { as: "subsector", foreignKey: "subsector_id"});
  SubSector.hasMany(SubSectorScope, { as: "SubSectorScopes", foreignKey: "subsector_id"});
  SubSectorValue.belongsTo(SubSector, { as: "subsector", foreignKey: "subsector_id"});
  SubSector.hasMany(SubSectorValue, { as: "SubSectorValues", foreignKey: "subsector_id"});
  CityUser.belongsTo(User, { as: "user", foreignKey: "user_id"});
  User.hasMany(CityUser, { as: "CityUsers", foreignKey: "user_id"});
  User.belongsTo(User, { as: "organization", foreignKey: "organization_id"});
  User.hasMany(User, { as: "Users", foreignKey: "organization_id"});

  return {
    ActivityData: ActivityData,
    City: City,
    CityUser: CityUser,
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
    GDP: GDP,
    GHGs: GHGs,
    Inventory: Inventory,
    Methodology: Methodology,
    Population: Population,
    Publisher: Publisher,
    ReportingLevel: ReportingLevel,
    Scope: Scope,
    Sector: Sector,
    SectorValue: SectorValue,
    SubCategory: SubCategory,
    SubCategoryValue: SubCategoryValue,
    SubSector: SubSector,
    SubSectorReportingLevel: SubSectorReportingLevel,
    SubSectorScope: SubSectorScope,
    SubSectorValue: SubSectorValue,
    User: User,
    Version: Version,
  };
}
