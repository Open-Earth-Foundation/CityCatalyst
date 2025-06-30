import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createPopulationRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { logger } from "@/services/logger";

export const POST = apiHandler(async (req, { session, params }) => {
  let body;

  try {
    const rawBody = await req.text();
    logger.info({ rawBody }, "Population API - Raw request body");

    if (!rawBody || rawBody.trim() === "") {
      throw new createHttpError.BadRequest("Request body is empty");
    }

    body = JSON.parse(rawBody);
    logger.info({ body }, "Population API - Parsed request body");
  } catch (error) {
    logger.error({ error }, "Population API - Failed to parse request body");
    throw new createHttpError.BadRequest("Invalid JSON in request body");
  }

  const validatedBody = createPopulationRequest.parse(body);
  logger.info({ validatedBody }, "Population API - Validated request body");

  const city = await UserService.findUserCity(params.city, session);

  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  const { cityId } = city;

  let cityPopulation = await db.models.Population.findOne({
    where: {
      cityId,
      year: validatedBody.cityPopulationYear,
    },
  });
  if (cityPopulation) {
    cityPopulation.population = validatedBody.cityPopulation;
    await cityPopulation.save();
  } else {
    cityPopulation = await db.models.Population.create({
      cityId,
      population: validatedBody.cityPopulation,
      year: validatedBody.cityPopulationYear,
    });
  }

  let regionPopulation = await db.models.Population.findOne({
    where: {
      cityId,
      year: validatedBody.regionPopulationYear,
    },
  });
  if (regionPopulation) {
    regionPopulation.regionPopulation = validatedBody.regionPopulation;
    await regionPopulation.save();
  } else {
    regionPopulation = await db.models.Population.create({
      cityId,
      regionPopulation: validatedBody.regionPopulation,
      year: validatedBody.regionPopulationYear,
    });
  }

  let countryPopulation = await db.models.Population.findOne({
    where: {
      cityId,
      year: validatedBody.countryPopulationYear,
    },
  });
  if (countryPopulation) {
    countryPopulation.countryPopulation = validatedBody.countryPopulation;
    await countryPopulation.save();
  } else {
    countryPopulation = await db.models.Population.create({
      cityId,
      countryPopulation: validatedBody.countryPopulation,
      year: validatedBody.countryPopulationYear,
    });
  }

  return NextResponse.json({
    data: { cityPopulation, regionPopulation, countryPopulation },
  });
});
