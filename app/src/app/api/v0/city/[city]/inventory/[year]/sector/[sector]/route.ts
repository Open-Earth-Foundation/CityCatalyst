import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSectorValueRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const sectorValue = await db.models.SectorValue.findOne({
    where: {
      sectorValueId: params.sector,
    },
  });

  if (!sectorValue) {
    throw new createHttpError.NotFound("Sector Value not found");
  }

  return NextResponse.json({ data: sectorValue });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  const body = createSectorValueRequest.parse(await req.json());
  let sectorValue = await db.models.SectorValue.findOne({
    where: { sectorValueId: params.sector },
  });

  if (!sectorValue) {
    throw new createHttpError.NotFound("Sector value not found");
  }

  sectorValue = await sectorValue.update(body);

  return NextResponse.json({ data: sectorValue });
});

export const DELETE = apiHandler(async (req: NextRequest, { params }) => {
  const sectorValue = await db.models.SectorValue.findOne({
    where: {
      sectorValueId: params.sector,
    },
  });
  if (!sectorValue) {
    throw new createHttpError.NotFound("Sector value not found");
  }

  await sectorValue.destroy();

  return NextResponse.json({ data: sectorValue, deleted: true });
});
