import { Roles } from "@/lib/auth";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { signupRequest } from "@/util/validation";
import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(async (req: Request) => {
  const body = signupRequest.parse(await req.json());
  const passwordHash = await bcrypt.hash(body.password, 12);
  console.log("Creating user", {
    userId: randomUUID(),
    name: body.name,
    email: body.email.toLowerCase(),
    passwordHash,
    role: Roles.User,
  })
  const user = await db.models.User.create({
    userId: randomUUID(),
    name: body.name,
    email: body.email.toLowerCase(),
    passwordHash,
    role: Roles.User,
  });

  return NextResponse.json({
    user: {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});
