export interface PrioritizerResponse {
  metadata: PrioritizerResponseMetadata;
  rankedActionsMitigation: PrioritizerRankedAction[];
  rankedActionsAdaptation: PrioritizerRankedAction[];
}

export interface PrioritizerResponseMetadata {
  locode: string;
  rankedDate: string;
}

export interface PrioritizerRankedAction {
  actionId: string;
  rank: number;
  explanation: {
    en: string;
    es: string;
    pt: string;
  };
}

export interface CityContextData {
  locode: string;
  populationSize: number | null;
}

export interface CityEmissionsData {
  stationaryEnergyEmissions: number | null;
  transportationEmissions: number | null;
  wasteEmissions: number | null;
  ippuEmissions: number | null;
  afoluEmissions: number | null;
}

export interface PrioritizerCityData {
  cityContextData: CityContextData;
  cityEmissionsData: CityEmissionsData;
}

export interface PrioritizerRequest {
  cityData: PrioritizerCityData;
}
