import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { passwordRegex, resetPasswordRequest } from "@/util/validation";
import bcrypt from "bcrypt";
import createHttpError from "http-errors";
import jwt from "jsonwebtoken";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requestPassword = z.object({
  password: z.string().min(4).regex(passwordRegex),
});

export const POST = apiHandler(
  async (
    _req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const body = requestPassword.parse(await _req.json());

    const userId = context.session?.user.id;
    const user = await db.models.User.findOne({ where: { userId } });

    if (!user) {
      throw createHttpError.NotFound("User not found!");
    }

    const password = body.password;
    const comparePassword = await bcrypt.compare(password, user.passwordHash!);

    return NextResponse.json({
      comparePassword,
    });
  },
);
