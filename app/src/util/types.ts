import type {
  DataSourceWithRelations,
  InventoryValueData,
  SubSectorWithRelations,
} from "@/app/[lng]/[inventory]/data/[step]/types";
import type { ScopeAttributes } from "@/models/Scope";
import type { SectorAttributes } from "@/models/Sector";
import type { SubCategoryAttributes } from "@/models/SubCategory";
import { DataSourceI18nAttributes as DataSourceAttributes } from "@/models/DataSourceI18n";
import type { InventoryValueAttributes } from "@/models/InventoryValue";
import type { SubSectorAttributes } from "@/models/SubSector";
import type { InventoryAttributes } from "@/models/Inventory";
import type { CityAttributes } from "@/models/City";
import type { GasValueAttributes } from "@/models/GasValue";
import type { EmissionsFactorAttributes } from "@/models/EmissionsFactor";
import Decimal from "decimal.js";
import {
  FailedSourceResult,
  RemovedSourceResult,
} from "@/backend/DataSourceService";

export interface CitiesAndYearsResponse {
  city: CityAttributes;
  years: { year: number; inventoryId: string; lastUpdate: Date }[];
}

export type InventoryResponse = InventoryAttributes & {
  city: CityAttributes & {
    populationYear: number;
    population: number;
  };
};

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
}[];

export interface GetDataSourcesResult {
  data: DataSourceResponse;
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
}

export type SectorBreakdownResponse = BreakdownByActivity & {
  byActivity: BreakdownByActivity;
  byScope: ActivityDataByScope[];
};
