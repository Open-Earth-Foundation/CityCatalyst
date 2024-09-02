import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import GPCService from "@/backend/GPCService";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const sector = await db.models.Sector.findByPk(params.sectorId);
  if (!sector) {
    throw new createHttpError.NotFound("Sector not found");
  }
  const requiredScopes = await GPCService.getRequiredScopes(params.sectorId);
  return NextResponse.json({ data: requiredScopes });
});