import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const subsector = await db.models.SubSector.findByPk(params.subsectorId);
  if (!subsector) {
    throw new createHttpError.NotFound("Subsector not found");
  }

  return NextResponse.json({ data: subsector });
});
