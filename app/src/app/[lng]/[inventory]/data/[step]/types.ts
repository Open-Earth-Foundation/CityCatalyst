import type { DataSourceI18nAttributes as DataSourceAttributes } from "@/models/DataSourceI18n";
import type { GasValueAttributes } from "@/models/GasValue";
import type { InventoryValueAttributes } from "@/models/InventoryValue";
import { Publisher } from "@/models/Publisher";
import { Scope, ScopeAttributes } from "@/models/Scope";
import type { Sector, SectorAttributes } from "@/models/Sector";
import { SubCategoryAttributes } from "@/models/SubCategory";
import { SubSectorAttributes } from "@/models/SubSector";
import type { EmissionsFactorWithDataSources } from "@/util/types";

export interface DataStep {
  name: string;
  description: string;
  icon: any;
  connectedProgress: number;
  addedProgress: number;
  totalSubSectors: number;
  referenceNumber: string;
  sector: SectorAttributes | null;
  subSectors: SubSectorWithRelations[] | null;
}

export type SubSector = {
  subsectorId: string;
  name: string;
  scope: { scopeName: string };
  completed: boolean;
  subsectorName: string;
  subCategories: SubCategory[];
};

export type SubCategory = {
  subcategoryId: string;
  subcategoryName?: string;
  referenceNumber?: string;
  activityName?: string;
  subsectorId?: string;
  scopeId?: string;
  reportinglevelId?: string;
  created?: Date;
  lastUpdated?: Date;
};

export type SubcategoryOption = {
  label: string;
  value: string;
};

export type ActivityData = {
  activityDataAmount?: number | null;
  activityDataUnit?: string | null;
  emissionFactorType: string;
  co2EmissionFactor: number;
  n2oEmissionFactor: number;
  ch4EmissionFactor: number;
  dataQuality: string;
  sourceReference: string;
};

export type DirectMeasureData = {
  co2Emissions: bigint;
  ch4Emissions: bigint;
  n2oEmissions: bigint;
  dataQuality: string;
  sourceReference: string;
};

export type SubcategoryData = {
  methodology: "activity-data" | "direct-measure" | "";
  isUnavailable: boolean;
  unavailableReason:
    | "no-occurrance"
    | "not-estimated"
    | "confidential-information"
    | "included-elsewhere"
    | "";
  unavailableExplanation: string;
  activity: ActivityData;
  direct: DirectMeasureData;
};

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export type EmissionsFactorData = Optional<
  EmissionsFactorWithDataSources,
  "id" | "dataSources"
>;
export type GasValueData = Omit<GasValueAttributes, "id" | "gasAmount"> & {
  emissionsFactor?: EmissionsFactorData;
  gasAmount?: bigint | null;
};

export type InventoryValueData = Omit<InventoryValueAttributes, "id"> & {
  dataSource?: Omit<DataSourceAttributes, "datasourceId">;
  gasValues?: GasValueData[];
};

export type DataSourceWithRelations = DataSourceAttributes & {
  subCategory:
    | (SubCategoryAttributes & {
        subsector: SubSectorAttributes;
        scope: ScopeAttributes;
      })
    | null;
  subSector: SubSectorAttributes | null;
  publisher: Publisher | null;
  inventoryValues: InventoryValueAttributes[];
  scopes: Scope[];
};

export type DataSourceData = {
  totals: {
    emissions: {
      co2_mass: string;
      co2_co2eq: string;
      ch4_mass: string;
      ch4_co2eq_100yr: string;
      ch4_co2eq_20yr: string;
      n2o_mass: string;
      n2o_co2eq_100yr: string;
      n2o_co2eq_20yr: string;
      co2eq_100yr: string;
      co2eq_20yr: string;
      gpc_quality: string;
    };
  };
  points?: any;
  scaleFactor: number;
  issue: string | null;
  records: DataSourceActivityDataRecord[];
};

export interface DataSourceActivityDataGas {
  gas_name: string;
  emissions_value: number;
  emissionfactor_value: number;
  emissionfactor_source: string;
  activity_value: number;
  gwp: number;
  emissions_value_100yr: number;
  emissions_value_20yr: number;
}

export interface DataSourceActivityDataRecord {
  methodology_name: string;
  emissions_geometry: string;
  activity_name: string;
  activity_units: string;
  activity_subcategory_type: { [key: string]: string };
  gases: DataSourceActivityDataGas[];
}

export type SubSectorWithRelations = SubSectorAttributes & {
  completed: boolean;
  completedCount: number;
  totalCount: number;
  scope: ScopeAttributes;
  subCategories: SubCategoryAttributes[];
};
