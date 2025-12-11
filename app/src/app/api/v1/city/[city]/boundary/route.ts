/**
 * @swagger
 * /api/v1/city/{city}/boundary:
 *   get:
 *     tags:
 *       - city
 *     operationId: getCityBoundary
 *     summary: Get city boundary data
 *     description: Retrieves geographic boundary data for a city using its location code (locode). Returns boundary information including geometry data that can be used for mapping and spatial analysis.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City location code (locode), not a UUID
 *     responses:
 *       200:
 *         description: City boundary returned.
 *       500:
 *         description: Failed to fetch boundary.
 */
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
