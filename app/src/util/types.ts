import type {
  DataSourceWithRelations,
  InventoryValueData,
  SubSectorWithRelations,
} from "@/app/[lng]/[inventory]/data/[step]/types";
import type { ScopeAttributes } from "@/models/Scope";
import type { SectorAttributes } from "@/models/Sector";
import type { SubCategoryAttributes } from "@/models/SubCategory";
import type { DataSourceI18nAttributes as DataSourceAttributes } from "@/models/DataSourceI18n";
import {
  InventoryValue,
  InventoryValueAttributes,
} from "@/models/InventoryValue";
import type { SubSectorAttributes } from "@/models/SubSector";
import type { InventoryAttributes } from "@/models/Inventory";
import type { CityAttributes } from "@/models/City";
import type { GasValue, GasValueAttributes } from "@/models/GasValue";
import type {
  EmissionsFactor,
  EmissionsFactorAttributes,
} from "@/models/EmissionsFactor";
import type { ActivityValue } from "@/models/ActivityValue";
import type Decimal from "decimal.js";
import type {
  FailedSourceResult,
  RemovedSourceResult,
} from "@/backend/DataSourceService";
import type { ProjectAttributes } from "@/models/Project";
import type { OrganizationAttributes } from "@/models/Organization";

export interface CityAndYearsResponse {
  city: CityAttributes;
  years: CityYearData[];
}

export interface CityYearData {
  year: number;
  inventoryId: string;
  lastUpdate: Date;
}

interface RequiredInventoryAttributes extends Required<InventoryAttributes> {}

export type FullInventoryValue = InventoryValue & {
  activityValues: (ActivityValue & {
    gasValues: (GasValue & { emissionsFactor?: EmissionsFactor })[];
  })[];
  dataSource: DataSourceAttributes;
};

export type InventoryDownloadResponse = InventoryAttributes & {
  inventoryValues: (InventoryValueAttributes & {
    dataSource?: DataSourceAttributes;
    gasValues: (GasValueAttributes & {
      emissionsFactor: EmissionsFactorAttributes;
    })[];
  })[];
  city: CityAttributes & {
    populationYear: number;
    population: number;
  };
};

export type InventoryResponse = RequiredInventoryAttributes & {
  city: CityAttributes & {
    populationYear: number;
    population: number;
    project: {
      projectId: string;
      name: string;
      organizationId: string;
    };
  };
  inventoryValues: FullInventoryValue[];
};

export interface InventoryPopulationsResponse {
  cityId: string;
  population: number;
  year: number;
  countryPopulation: number;
  countryPopulationYear: number;
  regionPopulation: number;
  regionPopulationYear: number;
}

export interface SectorProgress {
  sector: SectorAttributes;
  total: number;
  thirdParty: number;
  uploaded: number;
  subSectors: SubSectorWithRelations[];
}

export interface InventoryProgressResponse {
  inventory: InventoryResponse;
  totalProgress: {
    total: number;
    thirdParty: number;
    uploaded: number;
  };
  sectorProgress: SectorProgress[];
}

export interface UserInfoResponse {
  userId: string;
  name: string;
  defaultInventoryId: string | null;
  defaultCityId: string | null;
  role: Roles;
  email?: string;
  preferredLanguage?: string;
}

export type DataSource = DataSourceAttributes & {
  scopes: ScopeAttributes[];
  subSector?: SubSectorAttributes;
  subCategory?: SubCategoryAttributes;
  inventoryValues?: InventoryValueAttributes[];
};
export type DataSourceResponse = {
  source: DataSourceWithRelations;
  data: any;
};

export interface GetDataSourcesResult {
  data: DataSourceResponse[];
  removedSources: RemovedSourceResult[];
  failedSources: FailedSourceResult[];
}

export type InventoryValueResponse = InventoryValueAttributes & {
  dataSource: DataSourceAttributes;
  gasValues: GasValueAttributes & {
    emissionsFactor: EmissionsFactorAttributes;
  };
};

export interface ConnectDataSourceQuery {
  inventoryId: string;
  dataSourceIds: string[];
}

export interface ConnectDataSourceResponse {
  successful: string[];
  failed: string[];
  invalid: string[];
}

export interface InventoryValueUpdateQuery {
  subCategoryId: string;
  inventoryId: string;
  data: InventoryValueData;
}

export interface InventoryValueInSubSectorScopeUpdateQuery {
  subSectorId: string;
  inventoryId: string;
  data: InventoryValueData;
}

export interface InventoryValueInSubSectorDeleteQuery {
  subSectorId: string;
  inventoryId: string;
}

export interface InventoryDeleteQuery {
  inventoryId: string;
}

export interface InventoryUpdateQuery {
  inventoryId: string;
  data: { isPublic: boolean };
}

export type EmissionsFactorWithDataSources = EmissionsFactorAttributes & {
  dataSources: DataSourceAttributes[];
};
export type EmissionsFactorResponse = EmissionsFactorWithDataSources[];

export type InventoryWithCity = InventoryAttributes & { city: CityAttributes };

export interface OCCityAttributes {
  actor_id: string;
  name: string;
  is_part_of: string;
  root_path_geo: any;
  area: number;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image: string;
      role: string;
    };
  }
}

export interface fileContentValues {
  fileName: string;
  size: number;
  fileType: string;
}

export interface UserFileResponse {
  id: string;
  userId: string;
  cityId: string;
  fileReference: string;
  url: string;
  sector: string;
  subsectors: string[];
  scopes: string[];
  fileName: string;
  status: string;
  gpcRefNo: string;
  file: fileContentValues;
  lastUpdated: Date;
}

export interface UserInviteResponse {
  id: string;
  userId: string;
  locode: string;
  status: string;
  created: string;
  lastUpdated: string;
}

export enum Roles {
  User = "user",
  Admin = "admin",
}

export interface GetUserCityInvitesResponseUserData {
  userId: string;
  role: Roles;
  email: string;
  name: string;
}

export enum InviteStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  CANCELED = "canceled",
  EXPIRED = "expired",
}

export enum OrganizationRole {
  COLLABORATOR = "collaborator",
  ADMIN = "admin",
  ORG_ADMIN = "org_admin",
}

export interface GetUserCityInvitesResponse {
  id: string;
  email: string;
  user?: GetUserCityInvitesResponseUserData;
  cityId: string;
  userId: string;
  status: InviteStatus;
  cityInvites: Required<CityAttributes>;
}

export interface AcceptInviteResponse {
  success: boolean;
  error?: string;
}

export interface AcceptInviteRequest {
  email: string;
  cityIds: string[];
  token: string;
}

export interface UsersInvitesRequest {
  cityIds: string[];
  emails: string[];
}

export interface UsersInvitesResponse {
  success: boolean;
}

export interface RequiredScopesResponse {
  requiredScopes: string[];
}

export interface TopEmission {
  scopeName: string;
  co2eq: bigint;
  sectorName: string;
  subsectorName: string;
  percentage: number;
}

export interface SectorEmission {
  sectorName: string;
  co2eq: bigint;
  percentage: number;
}

export interface ResultsResponse {
  totalEmissions: {
    bySector: SectorEmission[];
    total: bigint;
  };
  topEmissions: { bySubSector: TopEmission[] };
}

export interface ProjectionData {
  [year: string]: {
    [sector: string]: number;
  };
}

export interface EmissionsForecastData {
  growthRates: ProjectionData;
  forecast: ProjectionData;
  cluster: {
    id: number;
    description: {
      [lng: string]: string;
    };
  };
}

export interface YearOverYearResultResponse {
  totalEmissions: {
    sumOfEmissions: bigint;
    totalEmissionsBySector: SectorEmission[];
  };
  topEmissionsBySubSector: {
    inventoryId: string;
    co2eq: bigint;
    percentage: number;
    scopeName: string;
    sectorName: string;
    subsectorName: string;
  };
}

export interface YearOverYearResultsResponse {
  [inventoryId: string]: YearOverYearResultResponse;
}

export interface SubsectorTotals {
  totalActivityValueByUnit: {
    [activityUnit: string]: bigint | string;
  };
  totalActivityEmissions: bigint | string;
}

export interface GroupedActivity {
  activityValue: string | Decimal; // Using string for "N/A"
  activityUnits: string;
  totalActivityEmissions: string | Decimal; // Using string  for "N/A"
  totalEmissionsPercentage: number;
}

export interface ActivityBreakdown {
  [subSector: string]:
    | {
        [activity: string]: GroupedActivity;
      }
    | SubsectorTotals;
}

export type BreakdownByActivity = Record<
  string,
  Record<string, Record<string, GroupedActivity>> & { totals: SubsectorTotals }
>;

export interface ActivityDataByScope {
  activityTitle: string;
  scopes: { [key: string]: Decimal };
  totalEmissions: Decimal;
  percentage: number;
  datasource_id: string;
  datasource_name: string;
  activities?: ActivityValue[];
}

export type SectorBreakdownResponse = BreakdownByActivity & {
  byActivity: BreakdownByActivity;
  byScope: ActivityDataByScope[];
};

export type InventoryValueWithActivityValues = InventoryValue & {
  activityValues: ActivityValue[];
};

export type InventoryWithInventoryValuesAndActivityValues =
  InventoryResponse & {
    inventoryValues: InventoryValueWithActivityValues[];
  };

export type OrganizationResponse = {
  contactEmail: string;
  created: string;
  last_updated: string;
  name: string;
  organizationId: string;
  themeId?: string;
  theme?: {
    themeId: string;
    themeKey: string;
  };
  logoUrl?: string;
  preferredLanguage?: string;
  active: boolean;
  projects: {
    projectId: string;
    name: string;
    cityCountLimit: number;
    cities: {
      cityId: string;
      name: string;
    }[];
  }[];
};

export type ProjectResponse = {
  cityCountLimit: number;
  created: string;
  description: string;
  last_updated: string;
  name: string;
  organizationId: string;
  projectId: string;
};

export type ListOrganizationsResponse = {
  contactEmail: string;
  created: string;
  last_updated: string;
  name: string;
  organizationId: string;
  organizationInvite: {
    status: InviteStatus;
    email: string;
    role: OrganizationRole;
  }[];
  active: boolean;
  projects: {
    projectId: string;
    name: string;
    cityCountLimit: number;
  }[];
};

export type CityResponse = {
  cityId: string;
  name: string;
  country: string;
  countryLocode: string;
  locode: string;
  inventories: {
    inventoryId: string;
    year: number;
    lastUpdated: string;
  }[];
};

export type ProjectWithCities = {
  projectId: string;
  name: string;
  description?: string;
  cityCountLimit?: Number;
  cities: CityResponse[];
};

export type ProjectWithCitiesResponse = ProjectWithCities[];

export type ProjectUserResponse = {
  email: string;
  role: OrganizationRole;
  status: InviteStatus;
  cityId?: string;
};

export type UserAccessResponse = {
  isOrgOwner: boolean;
  isProjectAdmin: boolean;
  isCollaborator: boolean;
  organizationId: string;
};
export enum ACTION_TYPES {
  Mitigation = "mitigation",
  Adaptation = "adaptation",
}

export type CityWithProjectDataResponse = CityAttributes & {
  project?: ProjectAttributes & { organization: OrganizationAttributes };
};

export type ThemeResponse = {
  themeId: string;
  themeKey: string;
};

export enum LANGUAGES {
  "en" = "en",
  "es" = "es",
  "pt" = "pt",
  "de" = "de",
  "fr" = "fr",
}

export type OrganizationWithThemeResponse = {
  contactEmail: string;
  created: string;
  last_updated: string;
  active: boolean;
  name: string;
  organizationId: string;
  themeId?: string;
  logoUrl?: string;
  theme: {
    themeId: string;
    themeKey: string;
  };
};

export interface UpdateUserPayload {
  name: string;
  email: string;
  userId: string;
  title?: string;
  preferredLanguage?: string;
}

export interface FormulaInputValuesResponse {
  gas: string;
  parameterCode: string;
  parameterName: string;
  methodologyName: string;
  gpcRefno: string;
  formulaInputValue: string;
  formulaInputUnit: string;
  formulaName: string;
  region: string;
}
export enum HighImpactActionRankingStatus {
  PENDING = "PENDING",
  SUCCESS = "SUCCESS",
  FAILURE = "FAILURE",
}
export interface CoBenefits {
  air_quality: number;
  water_quality: number;
  habitat: number;
  cost_of_living: number;
  housing: number;
  mobility: number;
  stakeholder_engagement: number;
}

export interface GHGReductionPotential {
  stationary_energy: string | null;
  transportation: string | null;
  waste: string | null;
  ippu: string | null;
  afolu: string | null;
}

export interface AdaptationEffectivenessPerHazard {
  floods: string | null;
  storms: string | null;
  diseases: string | null;
  droughts: string | null;
  heatwaves: string | null;
  wildfires: string | null;
  landslides: string | null;
  "sea-level-rise": string | null;
}

export interface Explanation {
  en: string;
  es: string;
  pt: string;
}

export interface BaseAction {
  id: string;
  hiaRankingId: string;
  lang: string;
  type: ACTION_TYPES;
  name: string;
  hazards: string[];
  sectors: string[];
  subsectors: string[];
  primaryPurposes: string[];
  description: string;
  dependencies: string[];
  cobenefits: CoBenefits;
  adaptationEffectivenessPerHazard: AdaptationEffectivenessPerHazard;
  equityAndInclusionConsiderations: string | null;
  costInvestmentNeeded: string;
  timelineForImplementation: string;
  keyPerformanceIndicators: string[];
  powersAndMandates: string[];
  biome: string | null;
  isSelected: boolean;
  actionId: string;
  rank: number;
  explanation: Explanation;
  created: Date;
  last_updated: Date;
}

export interface MitigationAction extends BaseAction {
  type: ACTION_TYPES.Mitigation;
  GHGReductionPotential: GHGReductionPotential;
  adaptationEffectiveness: null;
}

export interface AdaptationAction extends BaseAction {
  type: ACTION_TYPES.Adaptation;
  GHGReductionPotential: null;
  adaptationEffectiveness: string;
}

export type HIAction = MitigationAction | AdaptationAction;

export type HIAPResponse = {
  id: string;
  locode: string;
  inventoryId: string;
  lang: string;
  jobId: string;
  status: HighImpactActionRankingStatus;
  created: Date;
  last_updated: Date;
  rankedActions: HIAction[];
};

export interface LangMap {
  [langCode: string]: string;
}

export interface Client {
  clientId: string;
  redirectUri: string;
  name: LangMap;
  description: LangMap;
}

export type CityLocationResponse = {
  locode: string;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
};

// Permission system types
export enum UserRole {
  ORG_ADMIN = "ORG_ADMIN",
  PROJECT_ADMIN = "PROJECT_ADMIN",
  COLLABORATOR = "COLLABORATOR",
  PUBLIC_READER = "PUBLIC_READER",
  NO_ACCESS = "NO_ACCESS",
}

export type UserRoleType = keyof typeof UserRole;

export interface PermissionCheckResponse {
  hasAccess: boolean;
  userRole: UserRole;
  organizationId: string | null;
  context: {
    organizationId?: string;
    projectId?: string;
    cityId?: string;
    inventoryId?: string;
  };
}

export interface HIAPSummary {
  mitigation: {
    id: string;
    rankedActions: HIAction[];
  };
  adaptation: {
    id: string;
    rankedActions: HIAction[];
  };
  inventoryId: string;
}

export interface GHGInventorySummary {
  inventory: InventoryResponse;
  totalEmissions: {
    bySector: SectorEmission[];
    total: bigint;
  };
  topEmissions: { bySubSector: TopEmission[] };
  year: number;
}

export interface ModuleDataSummaryResponse {
  [key: string]: GHGInventorySummary | any;
}

export interface DashboardResponseType {
  data: ModuleDataSummaryResponse;
  metadata: {
    cityId: string;
    cityName: string;
    projectId: string;
  };
}
