import type { DataSourceAttributes } from "@/models/DataSource";
import type {
  EmissionsFactor,
  EmissionsFactorAttributes,
} from "@/models/EmissionsFactor";
import type { GasValueAttributes } from "@/models/GasValue";
import type { InventoryValueAttributes } from "@/models/InventoryValue";
import type { EmissionsFactorWithDataSources } from "@/util/types";

interface DataStep {
  title: string;
  details: string;
  icon: any;
  connectedProgress: number;
  addedProgress: number;
  totalSubSectors: number;
  referenceNumber: string;
  sector: Sector | null;
  subSectors: Array<SubSectorAttributes & { completed: boolean }> | null;
}

type SubSector = {
  subsectorId: string;
  name: string;
  scope: { scopeName: string };
  completed: boolean;
  subsectorName: string;
  subCategories: SubCategory[];
};

type SubCategory = {
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

type SubcategoryOption = {
  label: string;
  value: string;
};

type ActivityData = {
  activityDataAmount?: number;
  activityDataUnit?: string;
  emissionFactorType: string;
  co2EmissionFactor: number;
  n2oEmissionFactor: number;
  ch4EmissionFactor: number;
  dataQuality: string;
  sourceReference: string;
};

type DirectMeasureData = {
  co2Emissions: bigint;
  ch4Emissions: bigint;
  n2oEmissions: bigint;
  dataQuality: string;
  sourceReference: string;
};

type SubcategoryData = {
  methodology: "activity-data" | "direct-measure" | "";
  isUnavailable: bool;
  unavailableReason:
    | "no-occurrance"
    | "not-estimated"
    | "confidential-information"
    | "presented-elsewhere"
    | "";
  unavailableExplanation: string;
  activity: ActivityData;
  direct: DirectMeasureData;
};

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

type EmissionsFactorData = Optional<EmissionsFactorWithDataSources, "id" | "dataSources">;
type GasValueData = Omit<GasValueAttributes, "id" | "gasAmount"> & {
  emissionsFactor?: EmissionsFactorData;
  gasAmount?: bigint | null;
};

type InventoryValueData = Omit<InventoryValueAttributes, "id"> & {
  dataSource?: Omit<DataSourceAttributes, "datasourceId">;
  gasValues?: GasValueData[];
};
