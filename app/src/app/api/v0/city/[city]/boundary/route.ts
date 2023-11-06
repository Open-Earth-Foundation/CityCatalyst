import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import wellknown from "wellknown";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const city = await db.models.City.findOne({ where: { locode: params.city } });
  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  const boundary = await fetch(
    `https://ccglobal.openearth.dev/api/v0/cityboundary/city/${city.locode}`,
  );

  const data = await boundary.json();

  const wtkData = data.city_geometry;
  const getJsonData = wellknown.parse(wtkData);

  return NextResponse.json({ data: getJsonData });
});
