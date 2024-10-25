import UserService from "@/backend/UserService";
import { db } from "@/models";
import { PopulationAttributes } from "@/models/Population";
import { apiHandler } from "@/util/api";
import { PopulationEntry, findClosestYearToInventory } from "@/util/helpers";
import { NextResponse } from "next/server";
import { Op } from "sequelize";
import { z } from "zod";

const maxPopulationYearDifference = 5;

export const GET = apiHandler(async (_req: Request, { session, params }) => {
  const city = await UserService.findUserCity(params.city, session, true);
  const year = z.coerce.number().parse(params.year);
  const populations = await db.models.Population.findAll({
    where: {
      cityId: params.city,
      year: {
        [Op.between]: [
          year! - maxPopulationYearDifference,
          year! + maxPopulationYearDifference,
        ],
      },
    },
    order: [["year", "DESC"]], // favor more recent population entries
  });
  const cityPopulations = populations.filter((pop) => !!pop.population);
  const cityPopulation = findClosestYearToInventory(
    cityPopulations as PopulationEntry[],
    year!,
  );
  const countryPopulations = populations.filter(
    (pop) => !!pop.countryPopulation,
  );
  const countryPopulation = findClosestYearToInventory(
    countryPopulations as PopulationEntry[],
    year!,
  ) as PopulationAttributes;
  const regionPopulations = populations.filter((pop) => !!pop.regionPopulation);
  const regionPopulation = findClosestYearToInventory(
    regionPopulations as PopulationEntry[],
    year!,
  ) as PopulationAttributes;

  return NextResponse.json({
    data: {
      cityId: city.cityId,
      population: cityPopulation?.population,
      year: cityPopulation?.year,
      countryPopulation: countryPopulation?.population,
      countryPopulationYear: countryPopulation?.year,
      regionPopulation: regionPopulation?.population,
      regionPopulationYear: regionPopulation?.year,
    },
  });
});
