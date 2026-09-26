import { GLOBAL_API_URL } from "@/services/api";
import { logger } from "@/services/logger";
import createHttpError from "http-errors";
import wellknown from "wellknown";

export type CityBoundary = {
  data: wellknown.GeoJSONGeometryOrNull;
  boundingBox: number[];
  area: number;
};

type CityBoundaryApiResponse = {
  city_geometry?: string;
  bbox_west?: number;
  bbox_south?: number;
  bbox_east?: number;
  bbox_north?: number;
  area?: number;
};

/**
 * Global API city polygon + area. Callers that treat this as optional
 * (bulk import enrichment) must catch — missing Chile coverage and upstream
 * 500s that return a Python traceback instead of JSON are common.
 */
export default class CityBoundaryService {
  public static async getCityBoundary(
    cityLocode: string,
  ): Promise<CityBoundary> {
    const url = `${GLOBAL_API_URL}/api/v0/cityboundary/city/${encodeURIComponent(cityLocode)}`;
    logger.info({ locode: cityLocode, url }, "Fetching city boundary");

    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      logger.warn(
        { err, locode: cityLocode, url },
        "City boundary request network error",
      );
      throw new createHttpError.BadGateway(
        `City boundary request failed for ${cityLocode}`,
      );
    }

    const raw = await response.text();
    const data = this.parseBoundaryPayload(raw, cityLocode, response.status);

    if (!data.city_geometry) {
      throw new createHttpError.NotFound(
        `City boundary for locode ${cityLocode} not found`,
      );
    }

    const geoJson = wellknown.parse(data.city_geometry);
    const boundingBox = [
      data.bbox_west ?? 0,
      data.bbox_south ?? 0,
      data.bbox_east ?? 0,
      data.bbox_north ?? 0,
    ];

    return {
      data: geoJson,
      boundingBox,
      area: data.area ?? 0,
    };
  }

  /** Prefer a clean HTTP error over undici's SyntaxError on Python tracebacks. */
  private static parseBoundaryPayload(
    raw: string,
    cityLocode: string,
    status: number,
  ): CityBoundaryApiResponse {
    const trimmed = raw.trim();
    if (!responseOk(status)) {
      if (status === 404) {
        throw new createHttpError.NotFound(
          `City boundary for locode ${cityLocode} not found`,
        );
      }
      throw new createHttpError.BadGateway(
        `City boundary for locode ${cityLocode} unavailable (${status})`,
      );
    }

    if (
      !trimmed ||
      trimmed.startsWith("Traceback") ||
      trimmed.startsWith("<!")
    ) {
      throw new createHttpError.BadGateway(
        `City boundary for locode ${cityLocode} returned a non-JSON response from Global API`,
      );
    }

    try {
      return JSON.parse(trimmed) as CityBoundaryApiResponse;
    } catch {
      throw new createHttpError.BadGateway(
        `City boundary for locode ${cityLocode} returned invalid JSON from Global API`,
      );
    }
  }
}

function responseOk(status: number): boolean {
  return status >= 200 && status < 300;
}
