import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { PopulationEntry, findClosestYearToInventory } from "@/util/helpers";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req: Request, { session, params }) => {
  const city = await UserService.findUserCity(params.city, session);
  const population = await db.models.Population.findAll({
    where: { cityId: city?.cityId },
  });
  const populations: PopulationEntry[] = population.map(({population, year})=>{
    return {
      year,
      population: population!
    }
  })
 
  const closestYearPopulationData = findClosestYearToInventory(populations, parseInt(params.year))
  return NextResponse.json({ data: closestYearPopulationData });
});