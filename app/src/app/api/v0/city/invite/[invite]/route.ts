import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { InviteStatus } from "@/util/types";

export const GET = apiHandler(async (req, { params, session }) => {
  const invite = await db.models.CityInvite.findOne({
    where: {
      id: params.invite,
    },
  });

  if (!invite) {
    throw new createHttpError.NotFound("Not found");
  }

  const token = req.nextUrl.searchParams.get("token");
  const email = req.nextUrl.searchParams.get("email");
  const inventory = req.nextUrl.searchParams.get("inventoryId");

  const isVerified = jwt.verify(token!, process.env.VERIFICATION_TOKEN_SECRET!);

  if (!isVerified) {
    throw new createHttpError.BadRequest("Invalid token");
  }

  await invite.update({
    status: InviteStatus.ACCEPTED,
  });

  const user = await db.models.User.findOne({
    where: {
      email: email!,
    },
  });
  const host = process.env.HOST ?? "http://localhost:3000";

  const city = await db.models.City.findOne({
    where: { cityId: invite.cityId },
  });
  if (city && user) {
    await user.addCity(city.cityId);
  } else {
    throw new createHttpError.NotFound("City or User not found");
  }
  return NextResponse.redirect(`${host}/${inventory}`);
});
