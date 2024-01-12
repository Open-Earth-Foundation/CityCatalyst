import type { InventoryValueData } from "@/app/[lng]/data/[step]/types";
import type { ScopeAttributes } from "@/models/Scope";
import type { SectorAttributes } from "@/models/Sector";
import type { SubCategoryAttributes } from "@/models/SubCategory";
import type { DataSourceAttributes } from "@/models/DataSource";
import type { InventoryValueAttributes } from "@/models/SubCategoryValue";
import type { SubSectorValueAttributes } from "@/models/SubSectorValue";
import type { SubSectorAttributes } from "@/models/SubSector";
import type { InventoryAttributes } from "@/models/Inventory";
import type { CityAttributes } from "@/models/City";
import type { SubSector } from "@/util/types";
import type { GasValueAttributes } from "@/models/GasValue";
import type { EmissionsFactorAttributes } from "@/models/EmissionsFactor";

type InventoryResponse = InventoryAttributes & { city: CityAttributes };

interface SectorProgress {
  sector: SectorAttributes;
  total: number;
  thirdParty: number;
  uploaded: number;
  subSectors: SubSector[];
}

interface InventoryProgressResponse {
  inventoryId: string;
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
  defaultCityLocode: string | null;
  defaultInventoryYear: number | null;
}

type DataSource = DataSourceAttributes & {
  scopes: ScopeAttributes[];
  subSector?: SubSectorAttributes;
  subCategory?: SubCategoryAttributes;
  inventoryValues?: InventoryValueAttributes[];
};
type DataSourceResponse = { source: DataSource; data: any }[];

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

type InventoryWithCity = InventoryAttributes & { city: CityAttributes };

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
