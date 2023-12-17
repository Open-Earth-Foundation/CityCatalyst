import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createCityRequest, createUserRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const locode = params.city;
  const city = await db.models.City.findOne({ where: { locode } });
  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }
  const user = await db.models.User.findOne({
    where: {
      userId: params.user,
    },
    include: [
      {
        model: db.models.City,
        as: "cities",
        where: {
          locode: locode,
        },
      },
    ],
  });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  return NextResponse.json({ data: user });
});

export const PATCH = apiHandler(async (_req: NextRequest, { params }) => {
  const body = await _req.json();
  let user = await db.models.User.findOne({ where: { userId: params.user } });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  user = await user.update(body);

  return NextResponse.json({ data: user });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }) => {
  let user = await db.models.User.findOne({ where: { userId: params.user } });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  await user.destroy();

  return NextResponse.json({ data: user, deleted: true });
});
