import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createPopulationRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

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
  if (!cityPopulation) {
    await db.models.Population.create({
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
  if (!regionPopulation) {
    await db.models.Population.create({
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
  if (!countryPopulation) {
    countryPopulation = await db.models.Population.create({
      cityId,
      countryPopulation: body.countryPopulation,
      year: body.countryPopulationYear,
    });
  }

  return NextResponse.json({ success: true });
});
