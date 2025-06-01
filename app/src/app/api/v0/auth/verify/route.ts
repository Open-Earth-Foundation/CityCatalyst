import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { passwordRegex } from "@/util/validation";
import bcrypt from "bcrypt";
import createHttpError from "http-errors";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestVerification = z.object({
  password: z.string().min(4),
  token: z.string(),
});

export const GET = apiHandler(async (_req, { session }) => {
  const email = session?.user.email;
  if (!email) {
    throw new createHttpError.BadRequest(
      "User doesn't have an email assigned!",
    );
  }

  const user = await db.models.User.findOne({ where: { email } });

  if (!user) {
    throw createHttpError.NotFound("User not found!");
  }

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    console.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  const verificationToken = jwt.sign(
    { email: email },
    process.env.VERIFICATION_TOKEN_SECRET,
    {
      expiresIn: "1h",
    },
  );

  return NextResponse.json({
    verificationToken,
  });
});

export const POST = apiHandler(async (req: Request) => {
  const body = requestVerification.parse(await req.json());

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    console.error("Need to assign RESET_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  const verificationTokenData = jwt.verify(
    body.token,
    process.env.VERIFICATION_TOKEN_SECRET,
  );
  const email = (<any>verificationTokenData).email;
  const user = await db.models.User.findOne({ where: { email } });

  if (!user) {
    throw createHttpError.NotFound("User not found!");
  }

  const comparePassword = await bcrypt.compare(
    body.password,
    user.passwordHash!,
  );

  return NextResponse.json({ comparePassword });
});
