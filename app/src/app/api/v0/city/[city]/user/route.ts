import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createUserRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(async (req, { params, session }) => {
  const body = await req.json();

  // check if the user exists

  const existingUser = await db.models.User.findOne({
    where: { email: body.email! },
  });

  if (!existingUser) {
    // return a message to ui for the flow to continue and not break
    return NextResponse.json({ message: "User not found" });
  }

  return NextResponse.json({ data: existingUser });
});

export const GET = apiHandler(async (req, { params, session }) => {
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

export const DELETE = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { city } = params;

  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    throw new createHttpError.BadRequest("user-not-found");
  }

  await UserService.removeUserFromCity(city as string, email);

  return NextResponse.json(null);
});
