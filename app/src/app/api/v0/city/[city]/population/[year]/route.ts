import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import PopulationService from "@/backend/PopulationService";

export const GET = apiHandler(async (_req: Request, { session, params }) => {
  const city = await UserService.findUserCity(params.city, session, true);
  const year = z.coerce.number().parse(params.year);

  const cityPopulationData =
    await PopulationService.getPopulationDataForCityYear(city.cityId, year);

  return NextResponse.json({
    data: cityPopulationData,
  });
});
