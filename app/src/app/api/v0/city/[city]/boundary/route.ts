import { GLOBAL_API_URL } from "@/services/api";
import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import CityBoundaryService from "@/backend/CityBoundaryService";

export const GET = apiHandler(async (_req, { params }) => {
  const url = `${GLOBAL_API_URL}/api/v0/cityboundary/city/${params.city}`;
  logger.info(`Fetching ${url}`);

  try {
    const boundaryData = await CityBoundaryService.getCityBoundary(params.city);

    return NextResponse.json({ ...boundaryData });
  } catch (error: any) {
    logger.error(error);
    return NextResponse.json({ error: error.message });
  }
});
