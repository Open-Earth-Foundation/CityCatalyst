import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { resetPasswordRequest } from "@/util/validation";
import bcrypt from "bcrypt";
import createHttpError from "http-errors";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

export const POST = apiHandler(async (req: Request) => {
  const body = resetPasswordRequest.parse(await req.json());

  if (!process.env.RESET_TOKEN_SECRET) {
    console.error("Need to assign RESET_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  const resetTokenData = jwt.verify(
    body.resetToken,
    process.env.RESET_TOKEN_SECRET,
  );
  const email = (<any>resetTokenData).email;
  const user = await db.models.User.findOne({ where: { email } });

  if (!user) {
    throw createHttpError.NotFound("User not found!");
  }

  user.passwordHash = await bcrypt.hash(body.newPassword, 12);
  await user.save();

  return NextResponse.json({});
});
