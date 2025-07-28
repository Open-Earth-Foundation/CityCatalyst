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
      if (response.status !== 200) {
        return undefined;
      }

      const data = await response.json();
      return {
        ...data,
        growthRates: data.growth_rates,
      };
    } catch (error) {
      logger.error(`Error fetching growth rates: ${error}`);
      return undefined;
    }
  }

  public static async fetchAllClimateActions( lang: string) {
    try {
      const url = `${GLOBAL_API_URL}/api/v0/climate_actions`;
      const params = new URLSearchParams({
        language: lang,
      });

      logger.info("Fetching climate actions from API", {
        url,
        lang,
      });

      const response = await fetch(`${url}?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("API request failed", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          lang,
        });
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      logger.info("Successfully fetched climate actions", {
        lang,
      });
      return data;
    } catch (err) {
      logger.error({ err: err }, "Error fetching climate actions from API:");
      throw err;
    }
  }
}

export default GlobalAPIService;
