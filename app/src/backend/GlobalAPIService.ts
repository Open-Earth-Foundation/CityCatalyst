import { EmissionsForecastData } from "@/util/types";
import { GLOBAL_API_URL } from "@/services/api";
import { logger } from "@/services/logger";

export type GrowthRatesResponse = Omit<EmissionsForecastData, "forecast">;

export class GlobalAPIService {
  public static async fetchGrowthRates(
    locode: string,
    forecastYear: number,
  ): Promise<GrowthRatesResponse | undefined> {
    try {
      const URL = `${GLOBAL_API_URL}/api/v0/ghgi/emissions_forecast/city/${encodeURIComponent(locode)}/${forecastYear}`;
      const response = await fetch(URL);
      logger.info(`${URL} Response Status: ${response.status}`);
      const data = await response.json();
      if (response.status !== 200) {
        return undefined;
      }
      return {
        ...data,
        growthRates: data.growth_rates,
      };
    } catch (error) {
      console.error(`Error fetching growth rates: ${error}`);
      return undefined;
    }
  }
}

export default GlobalAPIService;
