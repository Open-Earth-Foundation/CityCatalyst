import UserService from "@/backend/UserService";
import { db } from "@/models";
import { PopulationAttributes } from "@/models/Population";
import { apiHandler } from "@/util/api";
import { PopulationEntry, findClosestYear } from "@/util/helpers";
import { NextResponse } from "next/server";
import { Op } from "sequelize";

const maxPopulationYearDifference = 5;

export const GET = apiHandler(async (_req: Request, { session, params }) => {
  const city = await UserService.findUserCity(params.city, session);
  const year  = parseInt(params.year)
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
  const cityPopulation = findClosestYear(
    cityPopulations as PopulationEntry[],
    year!,
  );
  const countryPopulations = populations.filter(
    (pop) => !!pop.countryPopulation,
  );
  const countryPopulation = findClosestYear(
    countryPopulations as PopulationEntry[],
    year!,
  ) as PopulationAttributes;
  const regionPopulations = populations.filter(
    (pop) => !!pop.regionPopulation,
  );
  const regionPopulation = findClosestYear(
    regionPopulations as PopulationEntry[],
    year!,
  ) as PopulationAttributes;

 
  return NextResponse.json({ data: {
    "cityId": city.cityId,
    "population": cityPopulation?.population,
    "year": cityPopulation?.year,
    "countryPopulation": countryPopulation.population,
    "countryPopulationYear": countryPopulation.year,
    "regionPopulation": regionPopulation.population,
    "regionPopulationYear": regionPopulation.year

 } });


});
