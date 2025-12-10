import CityBoundaryService, {
  CityBoundary,
} from "@/backend/CityBoundaryService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { db } from "@/models";
import { City } from "@/models/City";
import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import z from "zod";

const bulkLocationRequest = z.object({
  organizationId: z.string().optional(),
  projectId: z.string().optional(),
});

/**
 * @swagger
 * /api/v1/bulk-locations:
 *   get:
 *     tags:
 *       - Bulk Locations
 *     operationId: getBulkLocations
 *     summary: List approximate lat/lng for accessible cities by organization or project.
 *     description: Returns a list of city location center points computed from city boundary polygon data. For each city, the center latitude and longitude are calculated as the midpoint of the bounding box. Requires an authenticated user with proper access permissions to the specified organization or project. Cities with missing locode or boundary data will return error entries instead of location data. This endpoint is useful for mapping applications that need approximate city centers.
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         required: false
 *         description: UUID of the organization to get cities for. Either organizationId or projectId must be provided.
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: projectId
 *         required: false
 *         description: UUID of the project to get cities for. Either organizationId or projectId must be provided.
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Array of city location results wrapped in data. Each item is either a successful location object with lat/lng coordinates or an error object for cities that failed to load.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     oneOf:
 *                       - type: object
 *                         description: Successful location data for a city
 *                         properties:
 *                           locode:
 *                             type: string
 *                             description: City locode identifier
 *                           name:
 *                             type: string
 *                             description: City name
 *                           country:
 *                             type: string
 *                             description: Country name
 *                           latitude:
 *                             type: number
 *                             description: Center latitude calculated from city boundary
 *                           longitude:
 *                             type: number
 *                             description: Center longitude calculated from city boundary
 *                       - type: object
 *                         description: Error entry for a city that failed to load
 *                         properties:
 *                           error:
 *                             type: string
 *                             description: Error type (LOCODE_MISSING or FAILED_TO_LOAD_CITY_BOUNDARY)
 *                             enum: [LOCODE_MISSING, FAILED_TO_LOAD_CITY_BOUNDARY]
 *                           cityId:
 *                             type: string
 *                             format: uuid
 *                             description: UUID of the city that failed to load
 *             examples:
 *               example:
 *                 value:
 *                   data:
 *                     - locode: "US-NYC"
 *                       name: "New York"
 *                       country: "United States"
 *                       latitude: 40.7128
 *                       longitude: -74.006
 *                     - error: "FAILED_TO_LOAD_CITY_BOUNDARY"
 *                       cityId: "e1f2a3b4-0000-0000-0000-000000000000"
 *       400:
 *         description: Either organizationId or projectId must be provided as query parameter.
 *       401:
 *         description: User must be authenticated to access this endpoint.
 *       403:
 *         description: User does not have access to the specified organization or project.
 *       404:
 *         description: No cities found for the specified organization or project.
 *       500:
 *         description: Internal server error during city lookup or boundary data processing.
 */
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
  let cities: City[] = [];

  if (projectId) {
    cities = await db.models.City.findAll({
      where: { projectId },
      attributes: ["locode", "name", "country"],
    });
  } else if (organizationId) {
    cities = await db.models.City.findAll({
      attributes: ["locode", "name", "country"],
      include: [
        {
          model: db.models.Project,
          as: "project",
          attributes: [],
          include: [
            {
              model: db.models.Organization,
              attributes: [],
              as: "organization",
              where: { organizationId },
              required: true,
            },
          ],
        },
      ],
    });
  } else {
    throw new createHttpError.BadRequest(
      "Either organizationId or projectId must be provided as URL parameter",
    );
  }

  if (cities.length === 0) {
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
