import { db } from "@/models";
import { City } from "@/models/City";
import { apiHandler } from "@/util/api";
import { createCityRequest, createPopulationRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const GET = apiHandler(
  async (
    req: Request,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const { params, session } = context;
    const city = await db.models.City.findOne({
      where: {
        locode: params.city,
      },
    });
    if (!session) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }

    const population = await db.models.Population.findOne({
      where: { cityId: city?.cityId, year: params.year },
    });
    return NextResponse.json({ data: population });
  },
);
