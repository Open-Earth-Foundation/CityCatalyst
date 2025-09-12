/**
 * @swagger
 * /api/v0/projects/{project}/boundaries:
 *   get:
 *     tags:
 *       - Projects
 *     summary: Get boundary center points and latest inventory IDs for a project’s cities.
 *     description: Returns boundary info for each city (with center coordinates) plus the latest inventory ID per city, aggregating any errors for missing data. No explicit authentication is enforced in this handler; adjust upstream middleware if needed. Response is { result: CityBoundaryWithCity[], errors: {locode,error}[] }.
 *     parameters:
 *       - in: path
 *         name: project
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Boundary data and errors per city.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       boundingBox: { type: array, items: { type: number } }
 *                       city:
 *                         type: object
 *                         properties:
 *                           id: { type: string, format: uuid }
 *                           name: { type: string }
 *                           locode: { type: string }
 *                           latestInventoryId: { type: string, format: uuid }
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       locode: { type: string }
 *                       error: { type: string }
 *       404:
 *         description: Project not found.
 */
import { apiHandler } from "@/util/api";
import { Project } from "@/models/Project";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { db } from "@/models";
import CityBoundaryService, {
  CityBoundary,
} from "@/backend/CityBoundaryService";
import type { Inventory } from "@/models/Inventory";
import { logger } from "@/services/logger";
import { PermissionService } from "@/backend/permissions/PermissionService";

// TODO cache the results of this route
export const GET = apiHandler(async (req, { params, session }) => {
  const { project: projectId } = params;
  await PermissionService.canAccessProject(session, projectId);

  const project = await Project.findByPk(projectId as string, {
    include: [
      {
        model: db.models.City,
        as: "cities",
        attributes: ["locode", "cityId", "name"],
        include: [
          {
            model: db.models.Inventory,
            as: "inventories",
            attributes: ["inventoryId", "year"],
          },
        ],
      },
    ],
  });
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  }

  const errors: { locode?: string; error: any }[] = [];
  const cityResults = await Promise.all(
    project.cities
      .filter((city) => !!city.locode)
      .map(async (city) => {
        let boundary: CityBoundary | null = null;
        try {
          boundary = await CityBoundaryService.getCityBoundary(city.locode!);
        } catch (error: any) {
          const message =
            error instanceof Error ? error.message : "unknown-error";
          logger.error(
            `Failed to fetch boundary for city ${city.name} (${city.locode}, ${city.cityId}): ${message}`,
          );
          errors.push({
            locode: city.locode,
            error: message,
          });
        }

        if (!boundary) {
          return null;
        }

        let latestInventory: Inventory | null = null;
        if (city.inventories && city.inventories.length > 0) {
          latestInventory = city.inventories.reduce((latest, inventory) => {
            if (!latest) {
              return inventory;
            }
            if ((inventory.year ?? 0) > (latest.year ?? 0)) {
              return inventory;
            }
            return latest;
          });
        }

        return {
          ...boundary,
          city: {
            id: city.cityId,
            name: city.name,
            locode: city.locode,
            latestInventoryId: latestInventory?.inventoryId,
          },
        };
      }),
  );
  const result = cityResults.filter((cityResult) => cityResult != null);

  return NextResponse.json({ result, errors });
});
