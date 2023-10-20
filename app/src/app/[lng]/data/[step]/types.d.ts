type SubSector = {
  id: number | string;
  title: string;
  scopes: number[];
  isAdded: boolean;
  sectorName: string;
};

type DataSource = {
  id: number | string;
  icon: any;
  title: string;
  dataQuality: "low" | "medium" | "high";
  scopes: number[];
  description: string;
  url: string;
  isConnected: boolean;
  updateFrequency: string;
  sources: string[];
  methodology: string;
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
  activityDataUnit: string;
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

