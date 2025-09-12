/**
 * @swagger
 * /api/v0/city/{city}/population:
 *   get:
 *     tags:
 *       - City Population
 *     summary: Get most recent population data for a city
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Population data returned.
 *   post:
 *     tags:
 *       - City Population
 *     summary: Upsert population values for a city
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *       404:
 *         description: City not found.
 */
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createPopulationRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import PopulationService from "@/backend/PopulationService";

export const POST = apiHandler(async (req, { session, params }) => {
  const body = createPopulationRequest.parse(await req.json());
  const city = await UserService.findUserCity(params.city, session);

  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  const { cityId } = city;

  let cityPopulation = await db.models.Population.findOne({
    where: {
      cityId,
      year: body.cityPopulationYear,
    },
  });
  if (cityPopulation) {
    cityPopulation.population = body.cityPopulation;
    await cityPopulation.save();
  } else {
    cityPopulation = await db.models.Population.create({
      cityId,
      population: body.cityPopulation,
      year: body.cityPopulationYear,
    });
  }

  let regionPopulation = await db.models.Population.findOne({
    where: {
      cityId,
      year: body.regionPopulationYear,
    },
  });
  if (regionPopulation) {
    regionPopulation.regionPopulation = body.regionPopulation;
    await regionPopulation.save();
  } else {
    regionPopulation = await db.models.Population.create({
      cityId,
      regionPopulation: body.regionPopulation,
      year: body.regionPopulationYear,
    });
  }

  let countryPopulation = await db.models.Population.findOne({
    where: {
      cityId,
      year: body.countryPopulationYear,
    },
  });
  if (countryPopulation) {
    countryPopulation.countryPopulation = body.countryPopulation;
    await countryPopulation.save();
  } else {
    countryPopulation = await db.models.Population.create({
      cityId,
      countryPopulation: body.countryPopulation,
      year: body.countryPopulationYear,
    });
  }

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
