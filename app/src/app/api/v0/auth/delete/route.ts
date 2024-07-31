import { authOptions } from "@/lib/auth";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/services/logger";

export const POST = apiHandler(async (req: NextRequest) => {
  logger.debug("Cookies", req.cookies);
  const token = await getToken({ req });
  logger.debug("Token", token);
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new createHttpError.Unauthorized("Must be logged in!");
  }

  if (!session.user?.email) {
    throw new createHttpError.NotFound("Email not found in session!");
  }

  await db.models.User.destroy({
    where: {
      email: session.user.email,
    },
  });

  return NextResponse.json({ success: true });
});
