import type { Sequelize } from "sequelize";
import type {
  ActivityValueAttributes,
  ActivityValueCreationAttributes,
} from "./ActivityValue";
import { ActivityValue as _ActivityValue } from "./ActivityValue";
import type {
  ActivityDataAttributes,
  ActivityDataCreationAttributes,
} from "./ActivityData";
import { ActivityData as _ActivityData } from "./ActivityData";
import type {
  CatalogueAttributes,
  CatalogueCreationAttributes,
} from "./Catalogue";
import { Catalogue as _Catalogue } from "./Catalogue";
import type { CityAttributes, CityCreationAttributes } from "./City";
import { City as _City } from "./City";
import type {
  CityUserAttributes,
  CityUserCreationAttributes,
} from "./CityUser";
import { CityUser as _CityUser } from "./CityUser";
import type {
  DataSourceI18nAttributes as DataSourceAttributes,
  DataSourceI18nCreationAttributes as DataSourceCreationAttributes,
} from "./DataSourceI18n";
import { DataSourceI18n as _DataSource } from "./DataSourceI18n";
import type {
  DataSourceActivityDataAttributes,
  DataSourceActivityDataCreationAttributes,
} from "./DataSourceActivityData";
import { DataSourceActivityData as _DataSourceActivityData } from "./DataSourceActivityData";
import type {
  DataSourceEmissionsFactorAttributes,
  DataSourceEmissionsFactorCreationAttributes,
} from "./DataSourceEmissionsFactor";
import { DataSourceEmissionsFactor as _DataSourceEmissionsFactor } from "./DataSourceEmissionsFactor";
import type {
  DataSourceFormulaInputAttributes,
  DataSourceFormulaInputCreationAttributes,
} from "./DataSourceFormulaInput";
import { DataSourceFormulaInput as _DataSourceFormulaInput } from "./DataSourceFormulaInput";
import type {
  DataSourceGHGsAttributes,
  DataSourceGHGsCreationAttributes,
} from "./DataSourceGHGs";
import { DataSourceGHGs as _DataSourceGHGs } from "./DataSourceGHGs";
import type {
  DataSourceMethodologyAttributes,
  DataSourceMethodologyCreationAttributes,
} from "./DataSourceMethodology";
import { DataSourceMethodology as _DataSourceMethodology } from "./DataSourceMethodology";
import type {
  DataSourceReportingLevelAttributes,
  DataSourceReportingLevelCreationAttributes,
} from "./DataSourceReportingLevel";
import { DataSourceReportingLevel as _DataSourceReportingLevel } from "./DataSourceReportingLevel";
import type {
  DataSourceScopeAttributes,
  DataSourceScopeCreationAttributes,
} from "./DataSourceScope";
import { DataSourceScope as _DataSourceScope } from "./DataSourceScope";
import type {
  EmissionsFactorAttributes,
  EmissionsFactorCreationAttributes,
} from "./EmissionsFactor";
import { EmissionsFactor as _EmissionsFactor } from "./EmissionsFactor";
import {
  FormulaInput as _FormulaInput,
  FormulaInputAttributes,
  FormulaInputCreationAttributes,
} from "@/models/FormulaInput";
import type {
  GasValueAttributes,
  GasValueCreationAttributes,
} from "./GasValue";
import { GasValue as _GasValue } from "./GasValue";
import type {
  GasToCO2EqAttributes,
  GasToCO2EqCreationAttributes,
} from "./GasToCO2Eq";
import { GasToCO2Eq as _GasToCO2Eq } from "./GasToCO2Eq";
import type { GDPAttributes, GDPCreationAttributes } from "./GDP";
import { GDP as _GDP } from "./GDP";
import type { GHGsAttributes, GHGsCreationAttributes } from "./GHGs";
import { GHGs as _GHGs } from "./GHGs";
import type {
  InventoryAttributes,
  InventoryCreationAttributes,
} from "./Inventory";
import { Inventory as _Inventory } from "./Inventory";
import type {
  MethodologyAttributes,
  MethodologyCreationAttributes,
} from "./Methodology";
import { Methodology as _Methodology } from "./Methodology";
import type {
  PopulationAttributes,
  PopulationCreationAttributes,
} from "./Population";
import { Population as _Population } from "./Population";
import type {
  PublisherAttributes,
  PublisherCreationAttributes,
} from "./Publisher";
import { Publisher as _Publisher } from "./Publisher";
import type {
  ReportingLevelAttributes,
  ReportingLevelCreationAttributes,
} from "./ReportingLevel";
import { ReportingLevel as _ReportingLevel } from "./ReportingLevel";
import type { ScopeAttributes, ScopeCreationAttributes } from "./Scope";
import { Scope as _Scope } from "./Scope";
import type { SectorAttributes, SectorCreationAttributes } from "./Sector";
import { Sector as _Sector } from "./Sector";
import type {
  SubCategoryAttributes,
  SubCategoryCreationAttributes,
} from "./SubCategory";
import { SubCategory as _SubCategory } from "./SubCategory";
import type {
  InventoryValueAttributes,
  InventoryValueCreationAttributes,
} from "./InventoryValue";
import { InventoryValue as _InventoryValue } from "./InventoryValue";
import type {
  SubSectorAttributes,
  SubSectorCreationAttributes,
} from "./SubSector";
import { SubSector as _SubSector } from "./SubSector";
import type {
  SubSectorReportingLevelAttributes,
  SubSectorReportingLevelCreationAttributes,
} from "./SubSectorReportingLevel";
import { SubSectorReportingLevel as _SubSectorReportingLevel } from "./SubSectorReportingLevel";
import type { UserAttributes, UserCreationAttributes } from "./User";
import { User as _User } from "./User";
import type { VersionAttributes, VersionCreationAttributes } from "./Version";
import { Version as _Version } from "./Version";
import { UserFile as _UserFile } from "./UserFile";
import { CityInvite as _CityInvite } from "./CityInvite";
import type {
  AssistantMessageAttributes,
  AssistantMessageCreationAttributes,
} from "./AssistantMessage";
import { AssistantMessage as _AssistantMessage } from "./AssistantMessage";
import type {
  AssistantThreadAttributes,
  AssistantThreadCreationAttributes,
} from "./AssistantThread";
import { AssistantThread as _AssistantThread } from "./AssistantThread";

export {
  _ActivityData as ActivityData,
  _ActivityValue as ActivityValue,
  _Catalogue as Catalogue,
  _City as City,
  _CityUser as CityUser,
  _DataSource as DataSource,
  _DataSourceActivityData as DataSourceActivityData,
  _DataSourceEmissionsFactor as DataSourceEmissionsFactor,
  _DataSourceFormulaInput as DataSourceFormulaInput,
  _DataSourceMethodology as DataSourceMethodology,
  _DataSourceGHGs as DataSourceGHGs,
  _DataSourceReportingLevel as DataSourceReportingLevel,
  _DataSourceScope as DataSourceScope,
  _EmissionsFactor as EmissionsFactor,
  _FormulaInput as FormulaInput,
  _GasValue as GasValue,
  _GasToCO2Eq as GasToCO2Eq,
  _GDP as GDP,
  _GHGs as GHGs,
  _Inventory as Inventory,
  _Methodology as Methodology,
  _Population as Population,
  _Publisher as Publisher,
  _ReportingLevel as ReportingLevel,
  _Scope as Scope,
  _Sector as Sector,
  _SubCategory as SubCategory,
  _InventoryValue as InventoryValue,
  _SubSector as SubSector,
  _SubSectorReportingLevel as SubSectorReportingLevel,
  _User as User,
  _Version as Version,
  _UserFile as UserFile,
  _CityInvite as CityInvite,
  _AssistantMessage as AssistantMessage,
  _AssistantThread as AssistantThread,
};

export type {
  ActivityDataAttributes,
  ActivityDataCreationAttributes,
  ActivityValueAttributes,
  ActivityValueCreationAttributes,
  CatalogueAttributes,
  CatalogueCreationAttributes,
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
  DataSourceFormulaInputAttributes,
  DataSourceFormulaInputCreationAttributes,
  DataSourceGHGsAttributes,
  DataSourceGHGsCreationAttributes,
  DataSourceMethodologyAttributes,
  DataSourceMethodologyCreationAttributes,
  DataSourceReportingLevelAttributes,
  DataSourceReportingLevelCreationAttributes,
  DataSourceScopeAttributes,
  DataSourceScopeCreationAttributes,
  EmissionsFactorAttributes,
  EmissionsFactorCreationAttributes,
  GasValueAttributes,
  GasValueCreationAttributes,
  GasToCO2EqAttributes,
  GasToCO2EqCreationAttributes,
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
  SubCategoryAttributes,
  SubCategoryCreationAttributes,
  InventoryValueAttributes,
  InventoryValueCreationAttributes,
  SubSectorAttributes,
  SubSectorCreationAttributes,
  SubSectorReportingLevelAttributes,
  SubSectorReportingLevelCreationAttributes,
  UserAttributes,
  UserCreationAttributes,
  VersionAttributes,
  VersionCreationAttributes,
  AssistantMessageAttributes,
  AssistantMessageCreationAttributes,
  AssistantThreadAttributes,
  AssistantThreadCreationAttributes,
  FormulaInputAttributes,
  FormulaInputCreationAttributes,
};

export function initModels(sequelize: Sequelize) {
  const ActivityData = _ActivityData.initModel(sequelize);
  const ActivityValue = _ActivityValue.initModel(sequelize);
  const Catalogue = _Catalogue.initModel(sequelize);
  const City = _City.initModel(sequelize);
  const CityUser = _CityUser.initModel(sequelize);
  const DataSource = _DataSource.initModel(sequelize);
  const DataSourceActivityData = _DataSourceActivityData.initModel(sequelize);
  const DataSourceEmissionsFactor =
    _DataSourceEmissionsFactor.initModel(sequelize);
  const DataSourceFormulaInput = _DataSourceFormulaInput.initModel(sequelize);
  const DataSourceGHGs = _DataSourceGHGs.initModel(sequelize);
  const DataSourceMethodology = _DataSourceMethodology.initModel(sequelize);
  const DataSourceReportingLevel =
    _DataSourceReportingLevel.initModel(sequelize);
  const DataSourceScope = _DataSourceScope.initModel(sequelize);
  const EmissionsFactor = _EmissionsFactor.initModel(sequelize);
  const FormulaInput = _FormulaInput.initModel(sequelize);
  const GasValue = _GasValue.initModel(sequelize);
  const GasToCO2Eq = _GasToCO2Eq.initModel(sequelize);
  const GDP = _GDP.initModel(sequelize);
  const GHGs = _GHGs.initModel(sequelize);
  const Inventory = _Inventory.initModel(sequelize);
  const Methodology = _Methodology.initModel(sequelize);
  const Population = _Population.initModel(sequelize);
  const Publisher = _Publisher.initModel(sequelize);
  const ReportingLevel = _ReportingLevel.initModel(sequelize);
  const Scope = _Scope.initModel(sequelize);
  const Sector = _Sector.initModel(sequelize);
  const SubCategory = _SubCategory.initModel(sequelize);
  const InventoryValue = _InventoryValue.initModel(sequelize);
  const SubSector = _SubSector.initModel(sequelize);
  const SubSectorReportingLevel = _SubSectorReportingLevel.initModel(sequelize);
  const User = _User.initModel(sequelize);
  const Version = _Version.initModel(sequelize);
  const UserFile = _UserFile.initModel(sequelize);
  const CityInvite = _CityInvite.initModel(sequelize);
  const AssistantMessage = _AssistantMessage.initModel(sequelize);
  const AssistantThread = _AssistantThread.initModel(sequelize);
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
  GasValue.belongsTo(ActivityValue, {
    as: "activityValue",
    foreignKey: "activityValueId",
  });
  ActivityValue.hasMany(GasValue, {
    as: "gasValues",
    foreignKey: "activityValueId",
  });
  ActivityValue.belongsTo(DataSource, {
    as: "dataSource",
    foreignKey: "datasourceId",
  });
  DataSource.hasMany(ActivityValue, {
    as: "activityValues",
    foreignKey: "datasourceId",
  });
  ActivityValue.belongsTo(InventoryValue, {
    as: "inventoryValue",
    foreignKey: "inventoryValueId",
  });
  InventoryValue.hasMany(ActivityValue, {
    as: "activityValues",
    foreignKey: "inventoryValueId",
  });
  DataSource.belongsToMany(EmissionsFactor, {
    as: "emissionsFactorIdEmissionsFactors",
    through: DataSourceEmissionsFactor,
    foreignKey: "datasourceId",
    otherKey: "emissionsFactorId",
  });
  DataSource.belongsToMany(FormulaInput, {
    as: "formulaInputIdFormulaInputs",
    through: DataSourceFormulaInput,
    foreignKey: "datasourceId",
    otherKey: "formulaInputId",
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
    as: "scopes",
    through: DataSourceScope,
    foreignKey: "datasourceId",
    otherKey: "scopeId",
  });
  DataSource.belongsTo(Sector, {
    as: "sector",
    foreignKey: "sectorId",
  });
  DataSource.belongsTo(SubCategory, {
    as: "subCategory",
    foreignKey: "subcategoryId",
  });
  DataSource.belongsTo(SubSector, {
    as: "subSector",
    foreignKey: "subsectorId",
  });
  InventoryValue.belongsTo(DataSource, {
    as: "dataSource",
    foreignKey: "datasourceId",
  });
  EmissionsFactor.belongsToMany(DataSource, {
    as: "dataSources",
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
    as: "dataSources",
    through: DataSourceScope,
    foreignKey: "scopeId",
    otherKey: "datasourceId",
  });
  Sector.hasMany(DataSource, {
    as: "dataSources",
    foreignKey: "sectorId",
  });
  SubCategory.hasMany(DataSource, {
    as: "dataSources",
    foreignKey: "subcategoryId",
  });
  SubSector.hasMany(DataSource, {
    as: "dataSources",
    foreignKey: "subsectorId",
  });
  SubSector.belongsToMany(ReportingLevel, {
    as: "reportinglevelIdReportingLevelSubSectorReportingLevels",
    through: SubSectorReportingLevel,
    foreignKey: "subsectorId",
    otherKey: "reportinglevelId",
  });
  SubSector.hasOne(Scope, {
    as: "scope",
    foreignKey: "scopeId",
  });
  DataSourceActivityData.belongsTo(ActivityData, {
    as: "activitydatum",
    foreignKey: "activitydataId",
  });
  ActivityData.hasMany(DataSourceActivityData, {
    as: "dataSourceActivityData",
    foreignKey: "activitydataId",
  });
  User.belongsToMany(City, {
    through: CityUser,
    as: "cities",
    foreignKey: "userId",
    otherKey: "cityId",
  });
  User.belongsTo(Inventory, {
    as: "defaultInventory",
    foreignKey: "defaultInventoryId",
  });
  City.belongsToMany(User, {
    through: CityUser,
    as: "users",
    foreignKey: "cityId",
    otherKey: "userId",
  });
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
  DataSourceFormulaInput.belongsTo(DataSource, {
    as: "datasource",
    foreignKey: "datasourceId",
  });
  DataSource.hasMany(DataSourceFormulaInput, {
    as: "dataSourceFormulaInputs",
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
  DataSource.hasMany(InventoryValue, {
    as: "inventoryValues",
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
  DataSourceFormulaInput.belongsTo(FormulaInput, {
    as: "formulaInput",
    foreignKey: "formulaInputId",
  });
  FormulaInput.hasMany(DataSourceFormulaInput, {
    as: "dataSourceFormulaInput",
    foreignKey: "formulaInputId",
  });
  EmissionsFactor.belongsTo(Methodology, {
    as: "emissionsFactorMethodology",
    foreignKey: "methodologyId",
  });
  FormulaInput.belongsTo(Methodology, {
    as: "formulaValueMethodology",
    foreignKey: "methodologyId",
  });
  Methodology.hasMany(EmissionsFactor, {
    as: "emissionsFactors",
    foreignKey: "methodologyId",
  });
  Methodology.hasMany(FormulaInput, {
    as: "formulaValues",
    foreignKey: "methodologyId",
  });
  DataSourceGHGs.belongsTo(GHGs, { as: "ghg", foreignKey: "ghgId" });
  GHGs.hasMany(DataSourceGHGs, { as: "dataSourceGhgs", foreignKey: "ghgId" });
  InventoryValue.belongsTo(Inventory, {
    as: "inventory",
    foreignKey: "inventoryId",
  });
  Inventory.hasMany(InventoryValue, {
    as: "inventoryValues",
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
  SubSector.belongsTo(Sector, { as: "sector", foreignKey: "sectorId" });
  Sector.hasMany(SubSector, { as: "subSectors", foreignKey: "sectorId" });
  InventoryValue.belongsTo(SubSector, {
    as: "subSector",
    foreignKey: "subSectorId",
  });
  SubSector.hasMany(InventoryValue, {
    as: "inventoryValues",
    foreignKey: "subSectorId",
  });
  InventoryValue.belongsTo(Sector, {
    as: "sector",
    foreignKey: "sectorId",
  });
  Sector.hasMany(InventoryValue, {
    as: "inventoryValues",
    foreignKey: "sectorId",
  });
  InventoryValue.belongsTo(SubCategory, {
    as: "subCategory",
    foreignKey: "subCategoryId",
  });
  SubCategory.hasMany(InventoryValue, {
    as: "inventoryValues",
    foreignKey: "subCategoryId",
  });
  ActivityData.belongsTo(SubCategory, {
    as: "subcategory",
    foreignKey: "subcategoryId",
  });
  SubCategory.hasMany(ActivityData, {
    as: "activityData",
    foreignKey: "subcategoryId",
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
  User.hasMany(UserFile, { foreignKey: "userId", as: "user" });
  UserFile.belongsTo(User, { as: "userFiles", foreignKey: "userId" });
  UserFile.belongsTo(City, { foreignKey: "cityId", as: "city" });
  City.hasMany(UserFile, { foreignKey: "cityId", as: "userFiles" });
  City.hasMany(CityInvite, { as: "cityInvite", foreignKey: "cityId" });
  CityInvite.belongsTo(City, { as: "cityInvites", foreignKey: "cityId" });
  GasValue.belongsTo(InventoryValue, {
    as: "inventoryValue",
    foreignKey: "inventoryValueId",
  });
  InventoryValue.hasMany(GasValue, {
    as: "gasValues",
    foreignKey: "inventoryValueId",
  });
  GasValue.belongsTo(EmissionsFactor, {
    as: "emissionsFactor",
    foreignKey: "emissionsFactorId",
  });
  EmissionsFactor.hasMany(GasValue, {
    as: "gasValues",
    foreignKey: "emissionsFactorId",
  });
  Inventory.hasMany(EmissionsFactor, {
    as: "emissionsFactors",
    foreignKey: "inventoryId",
  });
  EmissionsFactor.belongsTo(Inventory, {
    as: "inventory",
    foreignKey: "inventoryId",
  });
  AssistantMessage.belongsTo(AssistantThread, {
    as: "assistantThread",
    foreignKey: "threadId",
  });
  AssistantThread.hasMany(AssistantMessage, {
    as: "assistantMessages",
    foreignKey: "threadId",
  });

  return {
    ActivityData: ActivityData,
    ActivityValue: ActivityValue,
    Catalogue: Catalogue,
    City: City,
    CityUser: CityUser,
    DataSource: DataSource,
    DataSourceActivityData: DataSourceActivityData,
    DataSourceEmissionsFactor: DataSourceEmissionsFactor,
    DataSourceFormulaInput: DataSourceFormulaInput,
    DataSourceGHGs: DataSourceGHGs,
    DataSourceMethodology: DataSourceMethodology,
    DataSourceReportingLevel: DataSourceReportingLevel,
    DataSourceScope: DataSourceScope,
    EmissionsFactor: EmissionsFactor,
    GasValue: GasValue,
    GasToCO2Eq: GasToCO2Eq,
    GDP: GDP,
    GHGs: GHGs,
    Inventory: Inventory,
    Methodology: Methodology,
    Population: Population,
    Publisher: Publisher,
    ReportingLevel: ReportingLevel,
    Scope: Scope,
    Sector: Sector,
    SubCategory: SubCategory,
    InventoryValue: InventoryValue,
    SubSector: SubSector,
    SubSectorReportingLevel: SubSectorReportingLevel,
    User: User,
    Version: Version,
    UserFile: UserFile,
    CityInvite: CityInvite,
    AssistantMessage: AssistantMessage,
    AssistantThread: AssistantThread,
    FormulaInput: FormulaInput,
  };
}
