import { logger } from "@/services/logger";
import { findClosestYear, PopulationEntry } from "@/util/helpers";
import * as dotenv from "dotenv";
import {
  pickUniqueOpenClimateCity,
  type OpenClimateCityResolveResult,
  type OpenClimateCitySearchHit,
} from "@/backend/openclimate-city-search";
import { countryCodeFromLocode } from "@/backend/BulkInventoryImportMatcher";

const numberOfYearsDisplayed = 10;

const OPENCLIMATE_BASE_URL = getOpenClimateApiUrl();

function getOpenClimateApiUrl() {
  dotenv.config();
  return (
    process.env.NEXT_PUBLIC_OPENCLIMATE_API_URL ||
    "https://app.openclimate.network"
  );
}

interface PopulationDataResult {
  error?: string;
  cityName?: string;
  cityPopulation?: number;
  cityPopulationYear?: number;
  regionPopulation?: number;
  regionPopulationYear?: number;
  countryPopulation?: number;
  countryPopulationYear?: number;
  region?: string;
  regionLocode?: string;
  country?: string;
  countryLocode?: string;
}

interface OpenClimateActorResponse {
  data: {
    name?: string;
    is_part_of?: string;
    population?: PopulationEntry[];
  };
}

type FetchPopulationResult = PopulationEntry & {
  data: OpenClimateActorResponse;
};

export default class OpenClimateService {
  public static async getCityName(cityLocode: string): Promise<string | null> {
    const url = OPENCLIMATE_BASE_URL + "/api/v1/actor/";
    const request = await fetch(url + cityLocode);
    const data = await request.json();

    return data.data.name;
  }

  /**
   * Same search onboarding uses (`GET /api/v1/search/city?q=`), city-type only.
   * Network failures return [] so bulk matching can continue without OC.
   */
  public static async searchCities(
    query: string,
  ): Promise<OpenClimateCitySearchHit[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const url = `${OPENCLIMATE_BASE_URL}/api/v1/search/city?q=${encodeURIComponent(q)}`;
    try {
      const request = await fetch(url);
      if (!request.ok) {
        logger.warn(
          { status: request.status, query: q },
          "OpenClimate city search returned a non-OK status",
        );
        return [];
      }
      const body = (await request.json()) as {
        data?: Array<OpenClimateCitySearchHit & { type?: string }>;
      };
      const rows = Array.isArray(body?.data) ? body.data : [];
      return rows.filter(
        (item) =>
          item?.type === "city" &&
          typeof item.actor_id === "string" &&
          typeof item.name === "string",
      );
    } catch (err) {
      logger.warn({ err, query: q }, "OpenClimate city search failed");
      return [];
    }
  }

  public static async resolveCityByName(
    name: string,
    countryLocode?: string | null,
  ): Promise<OpenClimateCityResolveResult> {
    const hits = await this.searchCities(name);
    return pickUniqueOpenClimateCity(hits, name, countryLocode);
  }

  public static async getPopulationData(
    inventoryLocode: string,
    inventoryYear: number,
  ): Promise<PopulationDataResult> {
    const url = OPENCLIMATE_BASE_URL + "/api/v1/actor/";
    const result: PopulationDataResult = {};

    try {
      const cityResult = await this.fetchPopulation(
        inventoryLocode,
        inventoryYear,
        url,
      );
      if (!cityResult) {
        result.error = "No city population result found!";
        return result;
      }
      result.cityPopulation = cityResult.population;
      result.cityPopulationYear = cityResult.year;
      result.cityName = cityResult.data.data.name;

      const regionLocode = cityResult.data.data.is_part_of;
      if (!regionLocode) {
        result.error = `City ${inventoryLocode} does not have a region locode in OpenClimate`;
        return result;
      }
      result.regionLocode = regionLocode;

      const countryLocode = countryCodeFromLocode(inventoryLocode);
      if (!countryLocode) {
        result.error = `Invalid locode supplied, doesn\'t have a country locode: ${inventoryLocode}`;
        return result;
      }
      result.countryLocode = countryLocode;

      const countryResult = await this.fetchPopulation(
        countryLocode,
        inventoryYear,
        url,
      );
      if (!countryResult) {
        result.error = "No country population result found!";
        return result;
      }
      result.countryPopulation = countryResult.population;
      result.countryPopulationYear = countryResult.year;
      result.country = countryResult.data.data.name;

      const regionResult = await this.fetchPopulation(
        regionLocode,
        inventoryYear,
        url,
      );
      if (!regionResult) {
        result.error = "No region population result found!";
        return result;
      }
      result.regionPopulation = regionResult.population;
      result.regionPopulationYear = regionResult.year;
      result.region = regionResult.data.data.name;
    } catch (err) {
      const message = `Failed to query population data for city ${inventoryLocode} and year ${inventoryYear} from URL ${url}: ${err}`;
      logger.error(message);
      result.error = message;
    }

    return result;
  }

  /**
   * Population for a single OpenClimate actor (city, region, or country).
   * Used for INE-only Chile cities where the city actor does not exist.
   */
  public static async getActorPopulation(
    actorId: string,
    inventoryYear: number,
  ): Promise<{ population: number; year: number; name?: string } | null> {
    const url = OPENCLIMATE_BASE_URL + "/api/v1/actor/";
    try {
      const result = await this.fetchPopulation(
        actorId,
        inventoryYear,
        url,
      );
      if (!result) return null;
      return {
        population: result.population,
        year: result.year,
        name: result.data.data.name,
      };
    } catch (err) {
      logger.warn(
        { err, actorId, inventoryYear },
        "OpenClimate actor population lookup failed (best-effort)",
      );
      return null;
    }
  }

  private static async fetchPopulation(
    actorLocode: string,
    inventoryYear: number,
    baseUrl: string,
  ): Promise<FetchPopulationResult | null> {
    const request = await fetch(baseUrl + actorLocode);
    const data = (await request.json()) as OpenClimateActorResponse;

    const result = findClosestYear(
      data.data.population,
      inventoryYear,
      numberOfYearsDisplayed,
    );
    if (!result) {
      return null;
    }

    return { ...result, data };
  }
}
