import CityService from "@/backend/CityService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { Session } from "next-auth";
import { NextResponse } from "next/server";

export const GET = apiHandler(
  async (
    _req: Request,
    { session, params }: { session?: Session; params: Record<string, string> },
  ) => {
    const city = await CityService.findUserCity(params.city, session);
    const population = await db.models.Population.findOne({
      where: { cityId: city?.cityId, year: params.year },
    });
    return NextResponse.json({ data: population });
  },
);
