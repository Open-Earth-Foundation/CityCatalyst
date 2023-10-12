import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSectorRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const sector = await db.models.Sector.findOne({
    where: {
      sectorId: params.sector,
    },
  });

  if (!sector) {
    throw new createHttpError.NotFound("Sector not found");
  }

  return NextResponse.json({ data: sector });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  const body = createSectorRequest.parse(await req.json());
  let sector = await db.models.Sector.findOne({
    where: { sectorId: params.sector },
  });

  if (!sector) {
    throw new createHttpError.NotFound("Sector not found");
  }

  sector = await sector.update(body);

  return NextResponse.json({ data: sector });
});

export const DELETE = apiHandler(async (req: NextRequest, { params }) => {
  const sector = await db.models.Sector.findOne({
    where: {
      sectorId: params.sector,
    },
  });
  if (!sector) {
    throw new createHttpError.NotFound("Sector not found");
  }

  await sector.destroy();

  return NextResponse.json({ data: sector, deleted: true });
});
