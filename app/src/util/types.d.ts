import type { DataSourceWithRelations, InventoryValueData } from "@/app/[lng]/[inventory]/data/[step]/types";
import type { ScopeAttributes } from "@/models/Scope";
import type { SectorAttributes } from "@/models/Sector";
import type { SubCategoryAttributes } from "@/models/SubCategory";
import type { DataSourceI18nAttributes as DataSourceAttributes } from "@/models/DataSourceI18n";
import type { InventoryValueAttributes } from "@/models/SubCategoryValue";
import type { SubSectorAttributes } from "@/models/SubSector";
import type { InventoryAttributes } from "@/models/Inventory";
import type { CityAttributes } from "@/models/City";
import type { SubSector } from "@/util/types";
import type { GasValueAttributes } from "@/models/GasValue";
import type { EmissionsFactorAttributes } from "@/models/EmissionsFactor";

type InventoryResponse = InventoryAttributes & {
  city: CityAttributes & {
    populationYear: number;
    population: number;
  };
};

interface SectorProgress {
  sector: SectorAttributes;
  total: number;
  thirdParty: number;
  uploaded: number;
  subSectors: SubSector[];
}

interface InventoryProgressResponse {
  inventory: InventoryResponse;
  totalProgress: {
    total: number;
    thirdParty: number;
    uploaded: number;
  };
  sectorProgress: SectorProgress[];
}

interface UserInfoResponse {
  userId: string;
  name: string;
  defaultInventoryId: string | null;
}

type DataSource = DataSourceAttributes & {
  scopes: ScopeAttributes[];
  subSector?: SubSectorAttributes;
  subCategory?: SubCategoryAttributes;
  inventoryValues?: InventoryValueAttributes[];
};
type DataSourceResponse = { source: DataSourceWithRelations; data: any }[];

type InventoryValueResponse = InventoryValueAttributes & {
  dataSource: DataSourceAttributes;
  gasValues: GasValueAttributes & {
    emissionsFactor: EmissionsFactorAttributes;
  };
};

interface ConnectDataSourceQuery {
  inventoryId: string;
  dataSourceIds: string[];
}

interface ConnectDataSourceResponse {
  successful: string[];
  failed: string[];
  invalid: string[];
}

interface InventoryValueUpdateQuery {
  subCategoryId: string;
  inventoryId: string;
  data: InventoryValueData;
}

type EmissionsFactorWithDataSources = EmissionsFactorAttributes & {
  dataSources: DataSourceAttributes[];
};
type EmissionsFactorResponse = EmissionsFactorWithDataSources[];

type InventoryWithCity = InventoryAttributes & { city: CityAttributes };

interface OCCityAttributes {
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

type fileContentValues = {
  fileName: string;
  size: number;
  fileType: string;
};

interface UserFileResponse {
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

interface UserInviteResponse {
  id: string;
  userId: string;
  locode: string;
  status: string;
  created: string;
  lastUpdated: string;
}

interface RequiredScopesResponse {
  requiredScopes: string[];
}

interface TopEmission {
  "co2eq": bigint;
  "sectorName": string;
  "subsectorName": string;
  "percentage": number;
}

interface ResultsResponse {
  totalEmissions: {
    "bySector": {
      "sectorName": string,
      "co2eq": bigint,
      "percentage": number
    }
    "total": bigint
  },
  topEmissions: { bySubSector: TopEmission[] };
}