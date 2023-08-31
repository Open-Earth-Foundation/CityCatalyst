import type { Sequelize } from "sequelize";
import { ActivityData as _ActivityData } from "./ActivityData";
import type {
  ActivityDataAttributes,
  ActivityDataCreationAttributes,
} from "./ActivityData";
import { City as _City } from "./City";
import type { CityAttributes, CityCreationAttributes } from "./City";
import { CityUser as _CityUser } from "./CityUser";
import type {
  CityUserAttributes,
  CityUserCreationAttributes,
} from "./CityUser";
import { DataSource as _DataSource } from "./DataSource";
import type {
  DataSourceAttributes,
  DataSourceCreationAttributes,
} from "./DataSource";
import { DataSourceActivityData as _DataSourceActivityData } from "./DataSourceActivityData";
import type {
  DataSourceActivityDataAttributes,
  DataSourceActivityDataCreationAttributes,
} from "./DataSourceActivityData";
import { DataSourceEmissionsFactor as _DataSourceEmissionsFactor } from "./DataSourceEmissionsFactor";
import type {
  DataSourceEmissionsFactorAttributes,
  DataSourceEmissionsFactorCreationAttributes,
} from "./DataSourceEmissionsFactor";
import { DataSourceGHGs as _DataSourceGHGs } from "./DataSourceGHGs";
import type {
  DataSourceGHGsAttributes,
  DataSourceGHGsCreationAttributes,
} from "./DataSourceGHGs";
import { DataSourceMethodology as _DataSourceMethodology } from "./DataSourceMethodology";
import type {
  DataSourceMethodologyAttributes,
  DataSourceMethodologyCreationAttributes,
} from "./DataSourceMethodology";
import { DataSourceReportingLevel as _DataSourceReportingLevel } from "./DataSourceReportingLevel";
import type {
  DataSourceReportingLevelAttributes,
  DataSourceReportingLevelCreationAttributes,
} from "./DataSourceReportingLevel";
import { DataSourceScope as _DataSourceScope } from "./DataSourceScope";
import type {
  DataSourceScopeAttributes,
  DataSourceScopeCreationAttributes,
} from "./DataSourceScope";
import { DataSourceSector as _DataSourceSector } from "./DataSourceSector";
import type {
  DataSourceSectorAttributes,
  DataSourceSectorCreationAttributes,
} from "./DataSourceSector";
import { DataSourceSubCategory as _DataSourceSubCategory } from "./DataSourceSubCategory";
import type {
  DataSourceSubCategoryAttributes,
  DataSourceSubCategoryCreationAttributes,
} from "./DataSourceSubCategory";
import { DataSourceSubSector as _DataSourceSubSector } from "./DataSourceSubSector";
import type {
  DataSourceSubSectorAttributes,
  DataSourceSubSectorCreationAttributes,
} from "./DataSourceSubSector";
import { EmissionsFactor as _EmissionsFactor } from "./EmissionsFactor";
import type {
  EmissionsFactorAttributes,
  EmissionsFactorCreationAttributes,
} from "./EmissionsFactor";
import { GDP as _GDP } from "./GDP";
import type { GDPAttributes, GDPCreationAttributes } from "./GDP";
import { GHGs as _GHGs } from "./GHGs";
import type { GHGsAttributes, GHGsCreationAttributes } from "./GHGs";
import { Inventory as _Inventory } from "./Inventory";
import type {
  InventoryAttributes,
  InventoryCreationAttributes,
} from "./Inventory";
import { Methodology as _Methodology } from "./Methodology";
import type {
  MethodologyAttributes,
  MethodologyCreationAttributes,
} from "./Methodology";
import { Population as _Population } from "./Population";
import type {
  PopulationAttributes,
  PopulationCreationAttributes,
} from "./Population";
import { Publisher as _Publisher } from "./Publisher";
import type {
  PublisherAttributes,
  PublisherCreationAttributes,
} from "./Publisher";
import { ReportingLevel as _ReportingLevel } from "./ReportingLevel";
import type {
  ReportingLevelAttributes,
  ReportingLevelCreationAttributes,
} from "./ReportingLevel";
import { Scope as _Scope } from "./Scope";
import type { ScopeAttributes, ScopeCreationAttributes } from "./Scope";
import { Sector as _Sector } from "./Sector";
import type { SectorAttributes, SectorCreationAttributes } from "./Sector";
import { SectorValue as _SectorValue } from "./SectorValue";
import type {
  SectorValueAttributes,
  SectorValueCreationAttributes,
} from "./SectorValue";
import { SubCategory as _SubCategory } from "./SubCategory";
import type {
  SubCategoryAttributes,
  SubCategoryCreationAttributes,
} from "./SubCategory";
import { SubCategoryValue as _SubCategoryValue } from "./SubCategoryValue";
import type {
  SubCategoryValueAttributes,
  SubCategoryValueCreationAttributes,
} from "./SubCategoryValue";
import { SubSector as _SubSector } from "./SubSector";
import type {
  SubSectorAttributes,
  SubSectorCreationAttributes,
} from "./SubSector";
import { SubSectorReportingLevel as _SubSectorReportingLevel } from "./SubSectorReportingLevel";
import type {
  SubSectorReportingLevelAttributes,
  SubSectorReportingLevelCreationAttributes,
} from "./SubSectorReportingLevel";
import { SubSectorScope as _SubSectorScope } from "./SubSectorScope";
import type {
  SubSectorScopeAttributes,
  SubSectorScopeCreationAttributes,
} from "./SubSectorScope";
import { SubSectorValue as _SubSectorValue } from "./SubSectorValue";
import type {
  SubSectorValueAttributes,
  SubSectorValueCreationAttributes,
} from "./SubSectorValue";
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
  const DataSourceEmissionsFactor =
    _DataSourceEmissionsFactor.initModel(sequelize);
  const DataSourceGHGs = _DataSourceGHGs.initModel(sequelize);
  const DataSourceMethodology = _DataSourceMethodology.initModel(sequelize);
  const DataSourceReportingLevel =
    _DataSourceReportingLevel.initModel(sequelize);
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

  ActivityData.belongsToMany(DataSource, {
    as: "datasourceIdDataSources",
    through: DataSourceActivityData,
    foreignKey: "activitydataId",
    otherKey: "datasourceId",
  });
  DataSource.belongsToMany(ActivityData, {
    as: "activitydataIdActivityData",
    through: DataSourceActivityData,
    foreignKey: "datasourceId",
    otherKey: "activitydataId",
  });
  DataSource.belongsToMany(EmissionsFactor, {
    as: "emissionsFactorIdEmissionsFactors",
    through: DataSourceEmissionsFactor,
    foreignKey: "datasourceId",
    otherKey: "emissionsFactorId",
  });
  DataSource.belongsToMany(GHGs, {
    as: "ghgIdGhgs",
    through: DataSourceGHGs,
    foreignKey: "datasourceId",
    otherKey: "ghgId",
  });
  DataSource.belongsToMany(Methodology, {
    as: "methodologyIdMethodologies",
    through: DataSourceMethodology,
    foreignKey: "datasourceId",
    otherKey: "methodologyId",
  });
  DataSource.belongsToMany(ReportingLevel, {
    as: "reportinglevelIdReportingLevels",
    through: DataSourceReportingLevel,
    foreignKey: "datasourceId",
    otherKey: "reportinglevelId",
  });
  DataSource.belongsToMany(Scope, {
    as: "scopeIdScopes",
    through: DataSourceScope,
    foreignKey: "datasourceId",
    otherKey: "scopeId",
  });
  DataSource.belongsToMany(Sector, {
    as: "sectorIdSectors",
    through: DataSourceSector,
    foreignKey: "datasourceId",
    otherKey: "sectorId",
  });
  DataSource.belongsToMany(SubCategory, {
    as: "subcategoryIdSubCategories",
    through: DataSourceSubCategory,
    foreignKey: "datasourceId",
    otherKey: "subcategoryId",
  });
  DataSource.belongsToMany(SubSector, {
    as: "subsectorIdSubSectors",
    through: DataSourceSubSector,
    foreignKey: "datasourceId",
    otherKey: "subsectorId",
  });
  EmissionsFactor.belongsToMany(DataSource, {
    as: "datasourceIdDataSourceDataSourceEmissionsFactors",
    through: DataSourceEmissionsFactor,
    foreignKey: "emissionsFactorId",
    otherKey: "datasourceId",
  });
  GHGs.belongsToMany(DataSource, {
    as: "datasourceIdDataSourceDataSourceGhgs",
    through: DataSourceGHGs,
    foreignKey: "ghgId",
    otherKey: "datasourceId",
  });
  Methodology.belongsToMany(DataSource, {
    as: "datasourceIdDataSourceDataSourceMethodologies",
    through: DataSourceMethodology,
    foreignKey: "methodologyId",
    otherKey: "datasourceId",
  });
  ReportingLevel.belongsToMany(DataSource, {
    as: "datasourceIdDataSourceDataSourceReportingLevels",
    through: DataSourceReportingLevel,
    foreignKey: "reportinglevelId",
    otherKey: "datasourceId",
  });
  ReportingLevel.belongsToMany(SubSector, {
    as: "subsectorIdSubSectorSubSectorReportingLevels",
    through: SubSectorReportingLevel,
    foreignKey: "reportinglevelId",
    otherKey: "subsectorId",
  });
  Scope.belongsToMany(DataSource, {
    as: "datasourceIdDataSourceDataSourceScopes",
    through: DataSourceScope,
    foreignKey: "scopeId",
    otherKey: "datasourceId",
  });
  Scope.belongsToMany(SubSector, {
    as: "subsectorIdSubSectorSubSectorScopes",
    through: SubSectorScope,
    foreignKey: "scopeId",
    otherKey: "subsectorId",
  });
  Sector.belongsToMany(DataSource, {
    as: "datasourceIdDataSourceDataSourceSectors",
    through: DataSourceSector,
    foreignKey: "sectorId",
    otherKey: "datasourceId",
  });
  SubCategory.belongsToMany(DataSource, {
    as: "datasourceIdDataSourceDataSourceSubCategories",
    through: DataSourceSubCategory,
    foreignKey: "subcategoryId",
    otherKey: "datasourceId",
  });
  SubSector.belongsToMany(DataSource, {
    as: "datasourceIdDataSourceDataSourceSubSectors",
    through: DataSourceSubSector,
    foreignKey: "subsectorId",
    otherKey: "datasourceId",
  });
  SubSector.belongsToMany(ReportingLevel, {
    as: "reportinglevelIdReportingLevelSubSectorReportingLevels",
    through: SubSectorReportingLevel,
    foreignKey: "subsectorId",
    otherKey: "reportinglevelId",
  });
  SubSector.belongsToMany(Scope, {
    as: "scopeIdScopeSubSectorScopes",
    through: SubSectorScope,
    foreignKey: "subsectorId",
    otherKey: "scopeId",
  });
  DataSourceActivityData.belongsTo(ActivityData, {
    as: "activitydatum",
    foreignKey: "activitydataId",
  });
  ActivityData.hasMany(DataSourceActivityData, {
    as: "dataSourceActivityData",
    foreignKey: "activitydataId",
  });
  CityUser.belongsTo(City, { as: "city", foreignKey: "cityId" });
  City.hasMany(CityUser, { as: "cityUsers", foreignKey: "cityId" });
  GDP.belongsTo(City, { as: "city", foreignKey: "cityId" });
  City.hasMany(GDP, { as: "gdps", foreignKey: "cityId" });
  Inventory.belongsTo(City, { as: "city", foreignKey: "cityId" });
  City.hasMany(Inventory, { as: "inventories", foreignKey: "cityId" });
  Population.belongsTo(City, { as: "city", foreignKey: "cityId" });
  City.hasMany(Population, { as: "populations", foreignKey: "cityId" });
  DataSourceActivityData.belongsTo(DataSource, {
    as: "datasource",
    foreignKey: "datasourceId",
  });
  DataSource.hasMany(DataSourceActivityData, {
    as: "dataSourceActivityData",
    foreignKey: "datasourceId",
  });
  DataSourceEmissionsFactor.belongsTo(DataSource, {
    as: "datasource",
    foreignKey: "datasourceId",
  });
  DataSource.hasMany(DataSourceEmissionsFactor, {
    as: "dataSourceEmissionsFactors",
    foreignKey: "datasourceId",
  });
  DataSourceGHGs.belongsTo(DataSource, {
    as: "datasource",
    foreignKey: "datasourceId",
  });
  DataSource.hasMany(DataSourceGHGs, {
    as: "dataSourceGhgs",
    foreignKey: "datasourceId",
  });
  DataSourceMethodology.belongsTo(DataSource, {
    as: "datasource",
    foreignKey: "datasourceId",
  });
  DataSource.hasMany(DataSourceMethodology, {
    as: "dataSourceMethodologies",
    foreignKey: "datasourceId",
  });
  DataSourceReportingLevel.belongsTo(DataSource, {
    as: "datasource",
    foreignKey: "datasourceId",
  });
  DataSource.hasMany(DataSourceReportingLevel, {
    as: "dataSourceReportingLevels",
    foreignKey: "datasourceId",
  });
  DataSourceScope.belongsTo(DataSource, {
    as: "datasource",
    foreignKey: "datasourceId",
  });
  DataSource.hasMany(DataSourceScope, {
    as: "dataSourceScopes",
    foreignKey: "datasourceId",
  });
  DataSourceSector.belongsTo(DataSource, {
    as: "datasource",
    foreignKey: "datasourceId",
  });
  DataSource.hasMany(DataSourceSector, {
    as: "dataSourceSectors",
    foreignKey: "datasourceId",
  });
  DataSourceSubCategory.belongsTo(DataSource, {
    as: "datasource",
    foreignKey: "datasourceId",
  });
  DataSource.hasMany(DataSourceSubCategory, {
    as: "dataSourceSubCategories",
    foreignKey: "datasourceId",
  });
  DataSourceSubSector.belongsTo(DataSource, {
    as: "datasource",
    foreignKey: "datasourceId",
  });
  DataSource.hasMany(DataSourceSubSector, {
    as: "dataSourceSubSectors",
    foreignKey: "datasourceId",
  });
  GDP.belongsTo(DataSource, { as: "datasource", foreignKey: "datasourceId" });
  DataSource.hasMany(GDP, { as: "gdps", foreignKey: "datasourceId" });
  Methodology.belongsTo(DataSource, {
    as: "datasource",
    foreignKey: "datasourceId",
  });
  DataSource.hasMany(Methodology, {
    as: "methodologies",
    foreignKey: "datasourceId",
  });
  Population.belongsTo(DataSource, {
    as: "datasource",
    foreignKey: "datasourceId",
  });
  DataSource.hasMany(Population, {
    as: "populations",
    foreignKey: "datasourceId",
  });
  DataSourceEmissionsFactor.belongsTo(EmissionsFactor, {
    as: "emissionsFactor",
    foreignKey: "emissionsFactorId",
  });
  EmissionsFactor.hasMany(DataSourceEmissionsFactor, {
    as: "dataSourceEmissionsFactors",
    foreignKey: "emissionsFactorId",
  });
  SubCategoryValue.belongsTo(EmissionsFactor, {
    as: "emissionsFactor",
    foreignKey: "emissionsFactorId",
  });
  EmissionsFactor.hasMany(SubCategoryValue, {
    as: "subCategoryValues",
    foreignKey: "emissionsFactorId",
  });
  SubSectorValue.belongsTo(EmissionsFactor, {
    as: "emissionsFactor",
    foreignKey: "emissionsFactorId",
  });
  EmissionsFactor.hasMany(SubSectorValue, {
    as: "subSectorValues",
    foreignKey: "emissionsFactorId",
  });
  DataSourceGHGs.belongsTo(GHGs, { as: "ghg", foreignKey: "ghgId" });
  GHGs.hasMany(DataSourceGHGs, { as: "dataSourceGhgs", foreignKey: "ghgId" });
  SectorValue.belongsTo(Inventory, {
    as: "inventory",
    foreignKey: "inventoryId",
  });
  Inventory.hasMany(SectorValue, {
    as: "sectorValues",
    foreignKey: "inventoryId",
  });
  SubCategoryValue.belongsTo(Inventory, {
    as: "inventory",
    foreignKey: "inventoryId",
  });
  Inventory.hasMany(SubCategoryValue, {
    as: "subCategoryValues",
    foreignKey: "inventoryId",
  });
  SubSectorValue.belongsTo(Inventory, {
    as: "inventory",
    foreignKey: "inventoryId",
  });
  Inventory.hasMany(SubSectorValue, {
    as: "subSectorValues",
    foreignKey: "inventoryId",
  });
  Version.belongsTo(Inventory, { as: "inventory", foreignKey: "inventoryId" });
  Inventory.hasMany(Version, { as: "versions", foreignKey: "inventoryId" });
  DataSourceMethodology.belongsTo(Methodology, {
    as: "methodology",
    foreignKey: "methodologyId",
  });
  Methodology.hasMany(DataSourceMethodology, {
    as: "dataSourceMethodologies",
    foreignKey: "methodologyId",
  });
  DataSource.belongsTo(Publisher, {
    as: "publisher",
    foreignKey: "publisherId",
  });
  Publisher.hasMany(DataSource, {
    as: "dataSources",
    foreignKey: "publisherId",
  });
  ActivityData.belongsTo(ReportingLevel, {
    as: "reportinglevel",
    foreignKey: "reportinglevelId",
  });
  ReportingLevel.hasMany(ActivityData, {
    as: "activityData",
    foreignKey: "reportinglevelId",
  });
  DataSourceReportingLevel.belongsTo(ReportingLevel, {
    as: "reportinglevel",
    foreignKey: "reportinglevelId",
  });
  ReportingLevel.hasMany(DataSourceReportingLevel, {
    as: "dataSourceReportingLevels",
    foreignKey: "reportinglevelId",
  });
  SubCategory.belongsTo(ReportingLevel, {
    as: "reportinglevel",
    foreignKey: "reportinglevelId",
  });
  ReportingLevel.hasMany(SubCategory, {
    as: "subCategories",
    foreignKey: "reportinglevelId",
  });
  SubSectorReportingLevel.belongsTo(ReportingLevel, {
    as: "reportinglevel",
    foreignKey: "reportinglevelId",
  });
  ReportingLevel.hasMany(SubSectorReportingLevel, {
    as: "subSectorReportingLevels",
    foreignKey: "reportinglevelId",
  });
  ActivityData.belongsTo(Scope, { as: "scope", foreignKey: "scopeId" });
  Scope.hasMany(ActivityData, { as: "activityData", foreignKey: "scopeId" });
  DataSourceScope.belongsTo(Scope, { as: "scope", foreignKey: "scopeId" });
  Scope.hasMany(DataSourceScope, {
    as: "dataSourceScopes",
    foreignKey: "scopeId",
  });
  SubCategory.belongsTo(Scope, { as: "scope", foreignKey: "scopeId" });
  Scope.hasMany(SubCategory, { as: "subCategories", foreignKey: "scopeId" });
  SubSectorScope.belongsTo(Scope, { as: "scope", foreignKey: "scopeId" });
  Scope.hasMany(SubSectorScope, {
    as: "subSectorScopes",
    foreignKey: "scopeId",
  });
  DataSourceSector.belongsTo(Sector, { as: "sector", foreignKey: "sectorId" });
  Sector.hasMany(DataSourceSector, {
    as: "dataSourceSectors",
    foreignKey: "sectorId",
  });
  SectorValue.belongsTo(Sector, { as: "sector", foreignKey: "sectorId" });
  Sector.hasMany(SectorValue, { as: "sectorValues", foreignKey: "sectorId" });
  SubSector.belongsTo(Sector, { as: "sector", foreignKey: "sectorId" });
  Sector.hasMany(SubSector, { as: "subSectors", foreignKey: "sectorId" });
  SubCategoryValue.belongsTo(SectorValue, {
    as: "sectorValue",
    foreignKey: "sectorValueId",
  });
  SectorValue.hasMany(SubCategoryValue, {
    as: "subCategoryValues",
    foreignKey: "sectorValueId",
  });
  SubSectorValue.belongsTo(SectorValue, {
    as: "sectorValue",
    foreignKey: "sectorValueId",
  });
  SectorValue.hasMany(SubSectorValue, {
    as: "subSectorValues",
    foreignKey: "sectorValueId",
  });
  ActivityData.belongsTo(SubCategory, {
    as: "subcategory",
    foreignKey: "subcategoryId",
  });
  SubCategory.hasMany(ActivityData, {
    as: "activityData",
    foreignKey: "subcategoryId",
  });
  DataSourceSubCategory.belongsTo(SubCategory, {
    as: "subcategory",
    foreignKey: "subcategoryId",
  });
  SubCategory.hasMany(DataSourceSubCategory, {
    as: "dataSourceSubCategories",
    foreignKey: "subcategoryId",
  });
  SubCategoryValue.belongsTo(SubCategory, {
    as: "subcategory",
    foreignKey: "subcategoryId",
  });
  SubCategory.hasMany(SubCategoryValue, {
    as: "subCategoryValues",
    foreignKey: "subcategoryId",
  });
  DataSourceSubSector.belongsTo(SubSector, {
    as: "subsector",
    foreignKey: "subsectorId",
  });
  SubSector.hasMany(DataSourceSubSector, {
    as: "dataSourceSubSectors",
    foreignKey: "subsectorId",
  });
  SubCategory.belongsTo(SubSector, {
    as: "subsector",
    foreignKey: "subsectorId",
  });
  SubSector.hasMany(SubCategory, {
    as: "subCategories",
    foreignKey: "subsectorId",
  });
  SubSectorReportingLevel.belongsTo(SubSector, {
    as: "subsector",
    foreignKey: "subsectorId",
  });
  SubSector.hasMany(SubSectorReportingLevel, {
    as: "subSectorReportingLevels",
    foreignKey: "subsectorId",
  });
  SubSectorScope.belongsTo(SubSector, {
    as: "subsector",
    foreignKey: "subsectorId",
  });
  SubSector.hasMany(SubSectorScope, {
    as: "subSectorScopes",
    foreignKey: "subsectorId",
  });
  SubSectorValue.belongsTo(SubSector, {
    as: "subsector",
    foreignKey: "subsectorId",
  });
  SubSector.hasMany(SubSectorValue, {
    as: "subSectorValues",
    foreignKey: "subsectorId",
  });
  CityUser.belongsTo(User, { as: "user", foreignKey: "userId" });
  User.hasMany(CityUser, { as: "cityUsers", foreignKey: "userId" });
  User.belongsTo(User, { as: "organization", foreignKey: "organizationId" });
  User.hasMany(User, { as: "users", foreignKey: "organizationId" });

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
