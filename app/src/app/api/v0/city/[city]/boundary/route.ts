import CityService from "@/backend/CityService";
import { GLOBAL_API_URL } from "@/services/api";
import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import wellknown from "wellknown";

export const GET = apiHandler(
  async (
    _req: NextRequest,
    { session, params }: { session?: Session; params: Record<string, string> },
  ) => {
    const city = await CityService.findUserCity(params.city, session);

    if (!city.locode) {
      throw new createHttpError.BadRequest(
        "City does not have a locode associated",
      );
    }

    const url = `${GLOBAL_API_URL}/api/v0/cityboundary/city/${city.locode}`;
    logger.info(`Fetching ${url}`);

    try {
      const boundary = await fetch(
        `${GLOBAL_API_URL}/api/v0/cityboundary/city/${city.locode}`,
      );

      const data = await boundary.json();

      if (!data.city_geometry) {
        throw new createHttpError.NotFound(
          `City boundary for locode ${params.city} not found`,
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

      return NextResponse.json({ data: geoJson, boundingBox });
    } catch (error: any) {
      logger.error(error);
      return NextResponse.json({ error: error.message });
    }
  },
);
