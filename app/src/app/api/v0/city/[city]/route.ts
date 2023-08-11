import { db } from "@/models";
import { City } from "@/models/City";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const city = await db.models.City.findOne({ where: { locode: params.city } });
  if (!city) {
    throw new createHttpError.NotFound('City not found');
  }

  return NextResponse.json({ data: city });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }) => {
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

  const body = createCityRequest.parse(await req.json());
  city = await city.update({
    cityId: randomUUID(),
    ...body,
  });
  return NextResponse.json({ data: city });
});

