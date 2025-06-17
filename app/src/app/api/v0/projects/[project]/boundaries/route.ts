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

// TODO cache the results of this route
export const GET = apiHandler(async (req, { params, session }) => {
  const { project: projectId } = params;
  // TODO perform access control by checking if the user is part of the organization/ project
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
