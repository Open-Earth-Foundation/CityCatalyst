import { apiHandler } from "@/util/api";
import { Project } from "@/models/Project";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { db } from "@/models";
import PopulationService from "@/backend/PopulationService";

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
            include: [
              {
                model: db.models.InventoryValue,
                as: "inventoryValues",
                include: [{ model: db.models.DataSource, as: "dataSource" }],
              },
            ],
          },
        ],
      },
    ],
  });
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  }

  const inventories = project.cities.flatMap((city) => city.inventories);
  const totalEmissions = inventories.reduce((acc, inventory) => {
    return acc + (inventory.totalEmissions ?? 0);
  }, 0);
  const latestUsedCityPopulations = await Promise.all(
    project.cities.map(async (city) => {
      if (city.inventories.length === 0) {
        return 0;
      }

      // find last year from all inventories to show the most recent population information that was used for the inventories
      const lastInventoryYear = city.inventories.sort(
        (a, b) => (b.year ?? 0) - (a.year ?? 0),
      )[0]?.year;
      if (!lastInventoryYear) {
        throw new createHttpError.UnprocessableEntity(
          "last-inventory-year-missing",
        );
      }
      const population = await PopulationService.getPopulationDataForCityYear(
        city.cityId,
        lastInventoryYear,
      );
      return Number(population.population) ?? 0;
    }),
  );
  const totalPopulation = latestUsedCityPopulations.reduce(
    (acc, population) => {
      return acc + population;
    },
    0,
  );

  const totalDataSources = inventories
    .map((project) =>
      project.inventoryValues.map(
        (inventoryValue) => inventoryValue.dataSource,
      ),
    )
    .filter((dataSource) => !!dataSource).length;

  const result = {
    totalCities: project.cities.length,
    totalEmissions,
    totalPopulation,
    totalDataSources,
  };

  return NextResponse.json(result);
});
