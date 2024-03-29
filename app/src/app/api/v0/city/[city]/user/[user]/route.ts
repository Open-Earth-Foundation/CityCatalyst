import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

export const GET = apiHandler(async (_req, { params, session }) => {
  const user = await UserService.findUser(params.user, session, {
    model: db.models.City,
    as: "cities",
  });
  return NextResponse.json({ data: user });
});

const updateUserRequest = z.object({
  name: z.string(),
  role: z.string(),
});

export const PATCH = apiHandler(async (_req, { params, session }) => {
  const body = updateUserRequest.parse(await _req.json());
  let user = await db.models.User.findOne({ where: { userId: params.user } });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  user = await user.update(body);

  return NextResponse.json({ data: user });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const user = await UserService.findUser(params.user, session);
  await user.destroy();

  return NextResponse.json({ data: user, deleted: true });
});
