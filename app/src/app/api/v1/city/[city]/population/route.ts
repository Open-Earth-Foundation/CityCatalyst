/**
 * @swagger
 * /api/v1/city/{city}/population:
 *   get:
 *     tags:
 *       - city
 *       - population
 *     operationId: getCityPopulation
 *     summary: Get most recent population data for a specific city
 *     description: Retrieves the most recent population data available for a specific city. Returns population information including city, region, and country population values. Requires authentication and access to the city.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: City ID for which to retrieve population data
 *     responses:
 *       200:
 *         description: Population data returned.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   description: Most recent population data for the city
 *   post:
 *     tags:
 *       - city
 *       - population
 *     operationId: postCityPopulation
 *     summary: Upsert population values for a city
 *     description: Creates or updates population values (city, region, and country) for a specific city. Requires authentication and access to the city.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: City ID for which to retrieve population data
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               [cityPopulation, cityPopulationYear, regionPopulation, regionPopulationYear, countryPopulation, countryPopulationYear]
 *             properties:
 *               cityPopulation:
 *                 type: number
 *               cityPopulationYear:
 *                 type: number
 *               regionPopulation:
 *                 type: number
 *               regionPopulationYear:
 *                 type: number
 *               countryPopulation:
 *                 type: number
 *               countryPopulationYear:
 *                 type: number
 *     responses:
 *       200:
 *         description: Population values updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     cityPopulation:
 *                       type: object
 *                       description: City population record
 *                     regionPopulation:
 *                       type: object
 *                       description: Region population record
 *                     countryPopulation:
 *                       type: object
 *                       description: Country population record
 *       404:
 *         description: City not found.
 */
import UserService from "@/backend/UserService";
import { db } from "@/models";
import type {
  Population,
  PopulationCreationAttributes,
} from "@/models/Population";
import { apiHandler } from "@/util/api";
import { createPopulationRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import PopulationService from "@/backend/PopulationService";

/**
 * Sets one population column for a city and year in a single statement,
 * leaving the row's other columns as they are. A separate findOne + create
 * raced when two requests saved the same city and year at once (for example
 * parallel onboardings of one city): the second insert broke the
 * (city_id, year) primary key and the request failed.
 */
async function upsertPopulation(
  cityId: string,
  year: number,
  values: Pick<
    PopulationCreationAttributes,
    "population" | "regionPopulation" | "countryPopulation"
  >,
): Promise<Population> {
  const [population] = await db.models.Population.upsert(
    { cityId, year, ...values },
    { returning: true },
  );
  return population;
}

export const POST = apiHandler(async (req, { session, params }) => {
  const body = createPopulationRequest.parse(await req.json());
  const city = await UserService.findUserCity(params.city, session);

  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  const { cityId } = city;

  const cityPopulation = await upsertPopulation(
    cityId,
    body.cityPopulationYear,
    { population: body.cityPopulation },
  );
  const regionPopulation = await upsertPopulation(
    cityId,
    body.regionPopulationYear,
    { regionPopulation: body.regionPopulation },
  );
  const countryPopulation = await upsertPopulation(
    cityId,
    body.countryPopulationYear,
    { countryPopulation: body.countryPopulation },
  );

  return NextResponse.json({
    data: { cityPopulation, regionPopulation, countryPopulation },
  });
});

export const GET = apiHandler(async (_req: Request, { session, params }) => {
  const city = await UserService.findUserCity(params.city, session, true);
  const cityPopulationData =
    await PopulationService.getMostRecentPopulationDataForCity(city.cityId);

  return NextResponse.json({
    data: cityPopulationData,
  });
});
