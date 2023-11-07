import { ScopeAttributes } from "@/models/Scope";
import type { SectorAttributes } from "@/models/Sector";

type InventoryResponse = InventoryAttributes & { city: CityAttributes };

interface SectorProgress {
  sector: SectorAttributes;
  total: number;
  thirdParty: number;
  uploaded: number;
  subSectors: Array<SubSectorAttributes & { completed: boolean }>;
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
  scopes: ScopeAttributes;
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
