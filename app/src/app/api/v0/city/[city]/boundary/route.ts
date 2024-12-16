import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import CityBoundaryService from "@/backend/CityBoundaryService";
import createHttpError from "http-errors";

export const GET = apiHandler(async (_req, { params }) => {
  try {
    const boundaryData = await CityBoundaryService.getCityBoundary(params.city);

    return NextResponse.json({ ...boundaryData });
  } catch (error: any) {
    logger.error(error);
    throw new createHttpError.InternalServerError(
      "Failed to fetch city boundary",
    );
  }
});
