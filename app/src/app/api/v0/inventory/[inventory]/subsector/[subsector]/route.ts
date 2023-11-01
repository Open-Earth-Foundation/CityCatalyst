import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSubSectorRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const subsectorValue = await db.models.SubSectorValue.findOne({
    where: { subsectorId: params.subsector, inventoryId: params.inventory },
  });
  if (!subsectorValue) {
    throw new createHttpError.NotFound("Sub sector value not found");
  }
  return NextResponse.json({ data: subsectorValue });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  const body = createSubSectorRequest.parse(await req.json());
  let subsectorValue = await db.models.SubSectorValue.findOne({
    where: { subsectorId: params.subsector, inventoryId: params.inventory },
  });

  if (subsectorValue) {
    subsectorValue = await subsectorValue.update(body);
  } else {
    subsectorValue = await db.models.SubSectorValue.create({
      subsectorValueId: randomUUID(),
      inventoryId: params.inventory,
      ...body,
    });
  }

  return NextResponse.json({ data: subsectorValue });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }) => {
  const subsectorValue = await db.models.SubSectorValue.findOne({
    where: { subsectorId: params.subsector, inventoryId: params.inventory },
  });
  if (!subsectorValue) {
    throw new createHttpError.NotFound("Sub sector value  not found");
  }

  await subsectorValue.destroy();

  return NextResponse.json({ data: subsectorValue, deleted: true });
});
