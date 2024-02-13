import CityService from "@/backend/CityService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createPopulationRequest } from "@/util/validation";
import { Session } from "next-auth";
import { NextResponse } from "next/server";

export const POST = apiHandler(
  async (
    req: Request,
    { session, params }: { session?: Session; params: Record<string, string> },
  ) => {
    const body = createPopulationRequest.parse(await req.json());
    const city = await CityService.findUserCity(params.city, session);

    const population = await db.models.Population.create({
      ...body,
      cityId: city.cityId,
    });
    return NextResponse.json({ data: population });
  },
);
