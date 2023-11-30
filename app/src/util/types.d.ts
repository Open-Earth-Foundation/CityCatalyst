import type { ScopeAttributes } from "@/models/Scope";
import type { SectorAttributes } from "@/models/Sector";
import type { SubCategoryAttributes } from "@/models/SubCategory";
import type { SubSectorAttributes } from "@/models/SubSector";
import type { InventoryAttributes } from "@/models/Inventory";
import type { CityAttributes } from "@/models/City";
import type { SubSector } from "@/util/types";

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

type DataSourceResponse = (DataSourceAttributes & {
  scopes: ScopeAttributes[];
  subSector?: SubSectorAttributes;
  subCategory?: SubCategoryAttributes;
})[];

interface ConnectDataSourceQuery {
  inventoryId: string;
  dataSourceIds: string[];
}

interface ConnectDataSourceResponse {
  successful: string[];
  failed: string[];
  invalid: string[];
}

interface SubsectorValueUpdateQuery {
  subSectorId: string;
  inventoryId: string;
  data: SubSectorValueAttributes;
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
