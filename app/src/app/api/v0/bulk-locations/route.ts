/**
 * @swagger
 * /api/v0/bulk-locations:
 *   get:
 *     tags:
 *       - Bulk Locations
 *     summary: Get bulk city locations
 *     description: Returns location data (latitude and longitude) for cities filtered by organization or project access.
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: projectId
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of city locations.
 *       400:
 *         description: Missing organizationId or projectId.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Cities not found.
 */
import CityBoundaryService, {
  CityBoundary,
} from "@/backend/CityBoundaryService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { db } from "@/models";
import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import z from "zod";

const bulkLocationRequest = z.object({
  organizationId: z.string().optional(),
  projectId: z.string().optional(),
});

export const GET = apiHandler(async (_req, { session, searchParams }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const { organizationId, projectId } = bulkLocationRequest.parse(searchParams);
  if (!organizationId && !projectId) {
    throw new createHttpError.BadRequest(
      "Either organizationId or projectId must be provided as URL parameter",
    );
  }

  // check access to organization or project
  await PermissionService.checkAccess(session, { organizationId, projectId });

  const cities = await db.models.City.findAll({
    where: projectId ? { projectId } : {},
    attributes: ["locode", "name", "country"],
    include: [
      {
        model: db.models.Project,
        as: "project",
        attributes: [],
        include: organizationId
          ? [
              {
                model: db.models.Organization,
                attributes: [],
                as: "organization",
                where: { organizationId },
              },
            ]
          : [],
      },
    ],
  });

  if (!cities) {
    throw new createHttpError.NotFound("Cities not found");
  }

  const cityLocations = await Promise.all(
    cities.map(async (city) => {
      if (!city.locode) {
        logger.error({ cityId: city.cityId }, "Locode is missing for city");
        return { error: "LOCODE_MISSING", cityId: city.cityId };
      }

      let boundaryData: CityBoundary | null = null;
      try {
        boundaryData = await CityBoundaryService.getCityBoundary(city.locode);
      } catch (err) {
        logger.error(
          { cityId: city.cityId, err },
          "Error fetching boundary data for city",
        );
        return { error: "FAILED_TO_LOAD_CITY_BOUNDARY", cityId: city.cityId };
      }

      const boundingBox = boundaryData.boundingBox;
      const latitude = (boundingBox[1] + boundingBox[3]) / 2;
      const longitude = (boundingBox[0] + boundingBox[2]) / 2;

      return {
        locode: city.locode,
        name: city.name,
        country: city.country,
        latitude,
        longitude,
      };
    }),
  );

  return NextResponse.json({ data: cityLocations });
});
