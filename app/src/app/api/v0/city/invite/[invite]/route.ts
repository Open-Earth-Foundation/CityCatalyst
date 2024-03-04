import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const GET = apiHandler(async (_req, { params, session }) => {
  const invite = await db.models.CityInvite.findOne({
    where: {
      id: params.invite,
    },
  });

  if (!invite) {
    throw new createHttpError.NotFound("Not found");
  }

  const token = _req.nextUrl.searchParams.get("token");
  const email = _req.nextUrl.searchParams.get("email");

  const isVerified = jwt.verify(token!, process.env.VERIFICATION_TOKEN_SECRET!);

  if (!isVerified) {
    throw new createHttpError.BadRequest("Invalid token");
  }

  await invite.update({
    status: "accepted",
  });

  const user = await db.models.User.findOne({
    where: {
      email: email!,
    },
  });

  if (!user) {
    return NextResponse.redirect("/");
  }

  const city = await db.models.City.findOne({
    where: { cityId: invite.cityId },
  });

  await user?.addCity(city?.cityId);

  return NextResponse.redirect("/");
});
