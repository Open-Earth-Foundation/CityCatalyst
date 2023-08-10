import { db } from "@/models";
import { City } from "@/models/City";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ValidationError } from "sequelize";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const city = await db.models.City.findOne({ where: { locode: params.city } });
  if (!city) {
    throw new createHttpError.NotFound('City not found');
  }

  return NextResponse.json({ data: city });
});

export const DELETE = apiHandler(async (req: NextRequest, { params }) => {
  const city = await db.models.City.findOne({ where: { locode: params.city } });
  if (!city) {
    throw new createHttpError.NotFound('City not found');
  }

  await city.destroy();

  return NextResponse.json({ data: city, deleted: true });
});


export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  let city: City = await db.models.City.findOne({ where: { locode: params.city } });
  if (!city) {
    throw new createHttpError.NotFound('City not found');
  }

  try {
    const body = createCityRequest.parse(await req.json());
    city = await city.update({
      cityId: randomUUID(),
      ...body,
    });
    return NextResponse.json({ data: city });
  } catch(error) {
    if (error instanceof ValidationError && error.name === 'SequelizeUniqueConstraintError') {
      throw new createHttpError.BadRequest('Locode exists already');
    } else {
      throw error;
    }
  }
});

