import CityBoundaryService from "@/backend/CityBoundaryService";
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

      const boundaryData = await CityBoundaryService.getCityBoundary(
        city.locode,
      );
      const boundingBox = boundaryData.boundingBox;
      const latitude = (boundingBox[1] + boundingBox[3]) / 2;
      const longitude = (boundingBox[0] + boundingBox[2]) / 2;

      if (!location) {
        logger.warn(`Location not found for city with locode: ${city.locode}`);
        return { locode: city.locode, latitude: null, longitude: null };
      }

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
