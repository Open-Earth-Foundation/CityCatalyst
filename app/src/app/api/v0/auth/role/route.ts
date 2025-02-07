import { Roles } from "@/util/types";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

const changeRoleRequest = z.object({
  email: z.string().email(),
  role: z.nativeEnum(Roles),
});

export const POST = apiHandler(async (req, { session }) => {
  if (session?.user.role !== Roles.Admin) {
    throw new createHttpError.Forbidden("Can only be used by admin accounts");
  }
  const body = changeRoleRequest.parse(await req.json());
  const user = await db.models.User.findOne({ where: { email: body.email } });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }
  if (user.role === body.role) {
    throw new createHttpError.BadRequest("User already has role " + body.role);
  }

  user.role = body.role;
  await user.save();

  return NextResponse.json({ success: true });
});
