import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSubSectorRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const subsectorValue = await db.models.SubSectorValue.findOne({
    where: { subsectorValueId: params.subsector },
  });
  if (!subsectorValue) {
    throw new createHttpError.NotFound("Sub sector value not found");
  }
  return NextResponse.json({ data: subsectorValue });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  const body = createSubSectorRequest.parse(await req.json());
  let subsectorValue = await db.models.SubSectorValue.findOne({
    where: { subsectorValueId: params.subsector },
  });

  if (!subsectorValue) {
    throw new createHttpError.NotFound("Sub sector value not found");
  }

  subsectorValue = await subsectorValue.update(body);

  return NextResponse.json({ data: subsectorValue });
});

export const DELETE = apiHandler(async (req: NextRequest, { params }) => {
  const subsectorValue = await db.models.SubSectorValue.findOne({
    where: {
      subsectorValueId: params.subsector,
    },
  });
  if (!subsectorValue) {
    throw new createHttpError.NotFound("Sub value sector not found");
  }

  await subsectorValue.destroy();

  return NextResponse.json({ data: subsectorValue, deleted: true });
});
