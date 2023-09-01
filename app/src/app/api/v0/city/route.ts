import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(async (req: Request) => {
  const body = createCityRequest.parse(await req.json());
  const city = await db.models.City.create({
    cityId: randomUUID(),
    ...body,
  });
  return NextResponse.json({ data: city });
});
