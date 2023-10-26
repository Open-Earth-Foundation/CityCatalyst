import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createUserRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(async (_req: NextRequest, { params }) => {
  const body = createUserRequest.parse(await _req.json());
  const user = await db.models.User.create({
    userId: randomUUID(),
    ...body,
  });
  const cityId = params.city;

  const city = await db.models.City.findOne({ where: { locode: params.city } });
  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  user.addCity(cityId);

  return NextResponse.json({ data: user });
});
