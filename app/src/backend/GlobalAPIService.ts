import { ACTION_TYPES, EmissionsForecastData } from "@/util/types";
import { GLOBAL_API_URL } from "@/services/api";
import { logger } from "@/services/logger";

export type GrowthRatesResponse = Omit<EmissionsForecastData, "forecast">;

export interface GlobalApiClimateAction {
  ActionID: string;
  ActionName: string;
  ActionType: ACTION_TYPES[];
  Hazard: string[] | null;
  Sector: string[] | null;
  Subsector: string[] | null;
  PrimaryPurpose: string[];
  Description: string;
  CoBenefits: { [k: string]: number };
  EquityAndInclusionConsiderations: string;
  GHGReductionPotential: { [k: string]: string };
  AdaptationEffectiveness: string | null;
  CostInvestmentNeeded: string | null;
  TimelineForImplementation: string | null;
  Dependencies: string[];
  KeyPerformanceIndicators: string[];
  PowersAndMandates: string[] | null;
  AdaptationEffectivenessPerHazard: { [k: string]: string };
  biome: string | null;
  // Legacy/alternate field names kept as fallbacks by some consumers.
  Explanation?: unknown;
  Cost?: string;
  Timeline?: string;
}

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

  public static async fetchAllClimateActions(
    lang: string,
  ): Promise<GlobalApiClimateAction[]> {
    try {
      const url = `${GLOBAL_API_URL}/api/v0/climate_actions`;
      const params = new URLSearchParams({
        language: lang,
      });

      logger.info({
        url,
        lang,
      }, "Fetching climate actions from API");

      const response = await fetch(`${url}?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          lang,
        }, "API request failed");
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      logger.info({
        lang,
      }, "Successfully fetched climate actions");
      return data;
    } catch (err) {
      logger.error({ err: err }, "Error fetching climate actions from API:");
      throw err;
    }
  }
}

export default GlobalAPIService;
