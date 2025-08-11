export type GHGIFormInputs = {
  year: number;
  inventoryGoal: string;
  globalWarmingPotential: string;
  cityPopulation: number;
  cityPopulationYear: number;
  regionPopulation: number;
  regionPopulationYear: number;
  countryPopulation: number;
  countryPopulationYear: number;
  totalCountryEmissions: number;
};

export type GHGICountryEmissionsEntry = {
  year: number;
  total_emissions: number;
};

export type GHGIOnboardingData = {
  name: string;
  locode: string;
  year: number;
  inventoryGoal: string;
  globalWarmingPotential: string;
};
