import { GLOBAL_API_URL } from "@/services/api";
import { logger } from "@/services/logger";
import createHttpError from "http-errors";
import wellknown from "wellknown";

export default class CityBoundaryService {
  public static async getCityBoundary(cityLocode: string): Promise<{
    data: wellknown.GeoJSONGeometryOrNull;
    boundingBox: any[];
    area: number;
  }> {
    const url = `${GLOBAL_API_URL}/api/v0/cityboundary/city/${cityLocode}`;
    logger.info(`Fetching ${url}`);

    const boundary = await fetch(url);

    const data = await boundary.json();

    if (!data.city_geometry) {
      throw new createHttpError.NotFound(
        `City boundary for locode ${cityLocode} not found`,
      );
    }

    const wtkData = data.city_geometry;
    const geoJson = wellknown.parse(wtkData);
    const boundingBox = [
      data.bbox_west,
      data.bbox_south,
      data.bbox_east,
      data.bbox_north,
    ];

    return {
      data: geoJson,
      boundingBox,
      area: data.area,
    };
  }
}
