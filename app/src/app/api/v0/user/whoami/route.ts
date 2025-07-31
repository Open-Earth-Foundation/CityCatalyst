import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

/** Return user data */

export const GET = apiHandler(async (_req, { params, session }) => {

  if (!session) {
    throw new createHttpError.Unauthorized(
      "Not signed in as the requested user",
    );
  }

  return NextResponse.json({
    data: session.user
  });
})
