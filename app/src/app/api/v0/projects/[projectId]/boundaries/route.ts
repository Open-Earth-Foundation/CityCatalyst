import { apiHandler } from "@/util/api";
import { Project } from "@/models/Project";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { db } from "@/models";
import CityBoundaryService from "@/backend/CityBoundaryService";

// TODO cache the results of this route
export const GET = apiHandler(async (req, { params, session }) => {
  const { projectId } = params;
  // TODO perform access control by checking if the user is part of the organization/ project
  const project = await Project.findByPk(projectId as string, {
    include: [
      {
        model: db.models.City,
        as: "cities",
        attributes: ["locode", "cityId"],
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
  const boundaries = await Promise.all(
    project.cities
      .filter((city) => !!city.locode)
      .map(async (city) => {
        const boundary = await CityBoundaryService.getCityBoundary(
          city.locode!,
        );
        const latestInventory = city.inventories.reduce((latest, inventory) => {
          if (!latest) {
            return inventory;
          }
          if ((inventory.year ?? 0) > (latest.year ?? 0)) {
            return inventory;
          }
          return latest;
        });

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

  return NextResponse.json(boundaries);
});
