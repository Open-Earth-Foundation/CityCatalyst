import { apiHandler } from "@/util/api";
import { NextRequest, NextResponse } from "next/server";
import wellknown from "wellknown";
import { GLOBAL_API_URL } from "@/services/api";
import { logger } from "@/services/logger";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const url:string = `${GLOBAL_API_URL}/api/v0/cityboundary/city/${params.city}`;

  logger.info(`Fetching ${url}`);

  try {
    const boundary = await fetch(
      `${GLOBAL_API_URL}/api/v0/cityboundary/city/${params.city}`,
    );

    const data = await boundary.json();

    const wtkData = data.city_geometry;
    const getJsonData = wellknown.parse(wtkData);

    return NextResponse.json({ data: getJsonData });
  } catch (error:any) {
    logger.error(error);
    return NextResponse.json({ error: error.message });
  }
});
