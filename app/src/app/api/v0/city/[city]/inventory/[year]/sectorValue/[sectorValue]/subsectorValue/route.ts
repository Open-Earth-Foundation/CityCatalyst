import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSubSectorValueRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(async (req: NextRequest, { params }) => {
  const body = createSubSectorValueRequest.parse(await req.json());

  const city = await db.models.City.findOne({ where: { locode: params.city } });
  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  const subsectorValue = await db.models.SubSectorValue.create({
    subsectorValueId: randomUUID(),
    ...body,
  });

  return NextResponse.json({ data: subsectorValue });
});
