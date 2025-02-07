import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Roles } from "@/util/types";

const updateUserRequest = z.object({
  name: z.string(),
  role: z.nativeEnum(Roles),
});

export const PATCH = apiHandler(async (_req, { params, session }) => {
  const body = updateUserRequest.parse(await _req.json());
  let user = await db.models.User.findOne({ where: { userId: params.userId } });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  user = await user.update(body);

  return NextResponse.json({ data: user });
});
