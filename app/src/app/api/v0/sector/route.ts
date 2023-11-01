import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSectorRequest } from "@/util/validation";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(async (req: NextRequest) => {
  const body = createSectorRequest.parse(await req.json());

  const sectorValue = await db.models.SectorValue.create({
    sectorValueId: randomUUID(),
    ...body,
  });

  return NextResponse.json({ data: sectorValue });
});
