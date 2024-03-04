import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createUserRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(async (_req, { params, session }) => {
  const body = createUserRequest.parse(await _req.json());

  const city = await UserService.findUserCity(params.city, session);

  // TODO shouldn't the users sign up themselves? This will probably prevent signup
  const user = await db.models.User.create({
    userId: randomUUID(),
    ...body,
  });
  user.addCity(city.cityId);

  return NextResponse.json({ data: user });
});

export const GET = apiHandler(async (_req, { params, session }) => {
  const city = await UserService.findUserCity(params.city, session);

  const users = await db.models.User.findAll({
    include: [
      {
        model: db.models.City,
        where: { cityId: city.cityId },
        as: "cities",
        required: true,
        attributes: ["cityId"],
      },
    ],
  });

  if (!users) {
    throw new createHttpError.NotFound("Users not found");
  }

  return NextResponse.json({ data: users });
});
