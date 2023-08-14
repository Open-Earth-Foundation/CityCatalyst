import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ValidationError } from "sequelize";

export const POST = apiHandler(async (req: NextRequest) => {
  try {
    const body = createCityRequest.parse(await req.json());
    const city = await db.models.City.create({
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

