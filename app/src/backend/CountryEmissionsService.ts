import { logger } from "@/services/logger";

interface CountryEmissionsEntry {
  year: number;
  total_emissions: number;
}

interface OCCountryData {
  emissions: {
    [sourceId: string]: {
      data: CountryEmissionsEntry[];
    };
  };
}

export interface CountryEmissionsResult {
  emissions: number;
  yearUsed: number;
  dataSource: string;
  countryCode: string;
}

export class CountryEmissionsService {
  private static readonly OPENCLIMATE_BASE_URL =
    process.env.NEXT_PUBLIC_OPENCLIMATE_API_URL ||
    "https://app.openclimate.network";

  /**
   * Fetches country emissions data from OpenClimate API
   */
  private static async fetchCountryEmissions(
    countryCode: string,
  ): Promise<OCCountryData | null> {
    const url = `${this.OPENCLIMATE_BASE_URL}/api/v1/actor/${countryCode}`;

    try {
      logger.info(
        { countryCode, url },
        "Fetching country data from OpenClimate API",
      );
      const response = await fetch(url);

      if (!response.ok) {
        logger.error(
          { status: response.status, countryCode },
          "Failed to fetch country data",
        );
        return null;
      }

      const json = await response.json();
      return json.data;
    } catch (error) {
      logger.error({ error, countryCode }, "Error fetching country data");
      return null;
    }
  }

  /**
   * Extracts emissions for a specific year, with fallback to closest available year
   */
  private static extractEmissionsForYear(
    countryData: OCCountryData,
    year: number,
    useClosestYear: boolean = true,
  ): { emissions: number; yearUsed: number; dataSource: string } | null {
    // Look for UNFCCC data source first (most authoritative)
    const keys = Object.keys(countryData.emissions || {});
    const unfcccSourceId = keys.find((id) => id.startsWith("UNFCCC"));
    
    let sourceId = unfcccSourceId;
    let dataSourceName = "UNFCCC";

    // Fallback to other sources if UNFCCC not available
    if (!sourceId) {
      sourceId = keys[0]; // Use first available source
      dataSourceName = sourceId?.split(":")[0] || "Unknown";
      logger.warn({ availableSources: keys }, "No UNFCCC data found, using fallback source");
    }

    if (!sourceId) {
      logger.warn("No emissions data sources found");
      return null;
    }

    const emissionsData = countryData.emissions[sourceId].data;

    // Try exact match first
    let yearData = emissionsData.find((e) => e.year === year);

    // If no exact match and useClosestYear is enabled, find closest year
    if (!yearData && useClosestYear && emissionsData.length > 0) {
      // Sort by year descending and find the closest year <= requested year
      const sortedData = [...emissionsData].sort((a, b) => b.year - a.year);

      // First try to find the most recent year that's <= requested year
      yearData = sortedData.find((e) => e.year <= year);

      // If no year <= requested year, use the most recent available year
      if (!yearData) {
        yearData = sortedData[0];
      }

      if (yearData) {
        logger.info(
          { requestedYear: year, usedYear: yearData.year },
          "Using closest available year for emissions data",
        );
      }
    }

    if (!yearData) {
      logger.warn({ year }, "No emissions data found for year");
      return null;
    }

    return {
      emissions: yearData.total_emissions,
      yearUsed: yearData.year,
      dataSource: dataSourceName,
    };
  }

  /**
   * Gets country emissions for a specific country and year
   */
  public static async getCountryEmissions(
    countryCode: string,
    year: number,
  ): Promise<CountryEmissionsResult | null> {
    const countryData = await this.fetchCountryEmissions(countryCode);

    if (!countryData) {
      return null;
    }

    const result = this.extractEmissionsForYear(countryData, year);

    if (!result) {
      return null;
    }

    return {
      emissions: result.emissions,
      yearUsed: result.yearUsed,
      dataSource: result.dataSource,
      countryCode,
    };
  }

  /**
   * Gets country code from city locode
   * LOCODE format: "CC CCC" where CC is country code
   */
  public static getCountryCodeFromLocode(locode: string): string | null {
    if (!locode || locode.length < 2) {
      return null;
    }
    
    // Extract first 2 characters as country code
    return locode.substring(0, 2);
  }
}