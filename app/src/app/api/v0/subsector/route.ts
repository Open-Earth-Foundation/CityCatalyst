import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSubSectorRequest } from "@/util/validation";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(async (req: NextRequest) => {
  const body = createSubSectorRequest.parse(await req.json());

  const subsectorValue = await db.models.SubSectorValue.create({
    subsectorValueId: randomUUID(),
    ...body,
  });

  return NextResponse.json({ data: subsectorValue });
});
