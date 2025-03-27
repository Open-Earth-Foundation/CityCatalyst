import { logger } from "@/services/logger";
import { findClosestYear, PopulationEntry } from "@/util/helpers";

const OPENCLIMATE_BASE_URL =
  process.env.NEXT_PUBLIC_OPENCLIMATE_API_URL ||
  "https://app.openclimate.network";

const numberOfYearsDisplayed = 10;

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

type FetchPopulationResult = PopulationEntry & { data: any };

export default class OpenClimateService {
  public static async getCityName(cityLocode: string): Promise<string | null> {
    const url = OPENCLIMATE_BASE_URL + "/api/v1/actor/";
    const request = await fetch(url + cityLocode);
    const data = await request.json();

    return data.data.name;
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

      const region = cityResult.root_path_geo?.filter(
        (item: any) => item.type === "adm1",
      )?.[0];
      const country = cityResult.root_path_geo?.filter(
        (item: any) => item.type === "country",
      )?.[0];
      result.region = region?.name ?? undefined;
      result.country = country?.name ?? undefined;
      result.regionLocode = region?.actor_id ?? undefined;

      let countryLocode = country?.actor_id ?? undefined;
      if (!countryLocode) {
        countryLocode =
          inventoryLocode && inventoryLocode.length > 0
            ? inventoryLocode.split(" ")[0]
            : null;
      }
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

      const regionLocode = cityResult.data.data.is_part_of;
      if (!regionLocode) {
        result.error = `City ${inventoryLocode} does not have a region locode in OpenClimate`;
        return result;
      }

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
    } catch (err) {
      const message = `Failed to query population data for city ${inventoryLocode} and year ${inventoryYear} from URL ${url}: ${err}`;
      logger.error(message);
      result.error = message;
    }

    return result;
  }

  private static async fetchPopulation(
    actorLocode: string,
    inventoryYear: number,
    baseUrl: string,
  ): Promise<(Record<string, any> & FetchPopulationResult) | null> {
    const request = await fetch(baseUrl + actorLocode);
    const data = await request.json();

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
