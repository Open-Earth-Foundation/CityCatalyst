import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSubSectorRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const subsector = await db.models.SubSector.findOne({
    where: { subsectorId: params.subsector },
  });
  console.log(params);
  if (!subsector) {
    throw new createHttpError.NotFound("Sub sector not found");
  }
  return NextResponse.json({ data: subsector });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  const body = createSubSectorRequest.parse(await req.json());
  let subsector = await db.models.SubSector.findOne({
    where: { subsectorId: params.subsector },
  });

  if (!subsector) {
    throw new createHttpError.NotFound("Sub sector not found");
  }

  subsector = await subsector.update(body);

  return NextResponse.json({ data: subsector });
});

export const DELETE = apiHandler(async (req: NextRequest, { params }) => {
  const subsector = await db.models.SubSector.findOne({
    where: {
      subsectorId: params.subsector,
    },
  });
  if (!subsector) {
    throw new createHttpError.NotFound("Sub sector not found");
  }

  await subsector.destroy();

  return NextResponse.json({ data: subsector, deleted: true });
});
