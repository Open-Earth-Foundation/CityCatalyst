/**
 * @swagger
 * /api/v0/bulk-locations:
 *   get:
 *     tags:
 *       - Bulk Locations
 *     summary: List approximate lat/lng for accessible cities by organization or project.
 *     description: Returns a list of city location center points computed from boundary data. Requires a signed‑in user with access to the specified organization or project; otherwise 401 is returned. Items can be either a location record or an error for cities missing data.
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: projectId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Array of results wrapped in data; each item is either a location or an error entry.
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
 *                         properties:
 *                           locode:
 *                             type: string
 *                           name:
 *                             type: string
 *                           country:
 *                             type: string
 *                           latitude:
 *                             type: number
 *                           longitude:
 *                             type: number
 *                       - type: object
 *                         properties:
 *                           error:
 *                             type: string
 *                           cityId:
 *                             type: string
 *                             format: uuid
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
