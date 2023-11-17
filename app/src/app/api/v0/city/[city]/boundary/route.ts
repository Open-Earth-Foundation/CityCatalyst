import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import wellknown from "wellknown";
import { GLOBAL_API_URL } from "@/services/api";
export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const boundary = await fetch(
    `${GLOBAL_API_URL}/api/v0/cityboundary/city/${params.city}`,
  );

  const data = await boundary.json();

  const wtkData = data.city_geometry;
  const getJsonData = wellknown.parse(wtkData);

  return NextResponse.json({ data: getJsonData });
});
