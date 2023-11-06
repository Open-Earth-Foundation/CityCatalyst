import { DataSourceAttributes } from "@/models/DataSource";

interface DataStep {
  title: string;
  details: string;
  icon: any;
  connectedProgress: number;
  addedProgress: number;
  referenceNumber: string;
  sector: Sector | null;
  subSectors: Array<SubSectorAttributes & { completed: boolean }> | null;
};

type SubSector = {
  subsectorId: string;
  name: string;
  scope: { scopeName: string };
  completed: boolean;
  subsectorName: string;
};

type DataSource = DataSourceAttributes & {
  subSectorValues: SubSectorValue[];
  subCategoryValues: SubCategoryValue[];
};

type SubCategory = {
  subcategoryId: string;
  subcategoryName?: string;
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
  sourceReference: string;
};

type DirectMeasureData = {
  co2Emissions: number;
  ch4Emissions: number;
  n2oEmissions: number;
  dataQuality: string;
  sourceReference: string;
};

type SubcategoryData = {
  fuel: ActivityData;
  grid: ActivityData;
  direct: DirectMeasureData;
};
