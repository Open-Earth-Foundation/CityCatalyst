import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req: Request, { session, params }) => {
  const city = await UserService.findUserCity(params.city, session);
  const population = await db.models.Population.findOne({
    where: { cityId: city?.cityId, year: params.year },
  });
  return NextResponse.json({ data: population });
});
