import { EmissionsForecastData } from "@/util/types";
import { GLOBAL_API_URL } from "@/services/api";

export type GrowthRatesResponse = Omit<EmissionsForecastData, "forecast">;

export const getGrowthRatesFromOC = async (
  locode: string,
  forecastYear: number,
): Promise<GrowthRatesResponse | undefined> => {
  try {
    const URL = `${GLOBAL_API_URL}/api/v0/ghgi/emissions_forecast/city/${encodeURIComponent(locode)}/${forecastYear}`;
    const response = await fetch(URL);

    console.info(`getGrowthRatesFromOC Status: ${response.status}`);
    const data = await response.json();
    return {
      ...data,
      growthRates: data.growth_rates,
    };
  } catch (error) {
    console.error(`Error fetching growth rates: ${error}`);
    return undefined;
  }
};
