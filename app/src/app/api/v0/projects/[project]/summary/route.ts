import { apiHandler } from "@/util/api";
import { Project } from "@/models/Project";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { db } from "@/models";
import PopulationService from "@/backend/PopulationService";
import { QueryTypes } from "sequelize";

export const GET = apiHandler(async (req, { params, session }) => {
  const { project: projectId } = params;

  // TODO perform access control/ only show public inventories
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

  // TODO [ON-2429]: Save total emissions for inventory every time activity data is modified
  const rawQuery = `
    SELECT SUM(co2eq)
    FROM "InventoryValue"
    WHERE inventory_id IN (:inventoryIds)
  `;

  const inventoryIds = inventories.map((inventory) => inventory.inventoryId);
  const [{ sum: totalEmissions }] = (await db.sequelize!.query(rawQuery, {
    replacements: { inventoryIds },
    type: QueryTypes.SELECT,
    raw: true,
  })) as unknown as { sum: number }[];

  // TODO [ON-2429]: enable this over the raw query above
  /* const totalEmissions = inventories.reduce((acc, inventory) => {
    return acc + (inventory.totalEmissions ?? 0);
  }, 0); */
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
