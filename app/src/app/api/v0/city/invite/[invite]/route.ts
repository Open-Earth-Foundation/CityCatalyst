import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const GET = apiHandler(
  async (
    req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const { params, session } = context;

    if (!session) throw new createHttpError.Unauthorized("Unauthorized");

    const invite = await db.models.CityInvite.findOne({
      where: {
        id: params.invite,
      },
    });

    if (!invite) {
      throw new createHttpError.NotFound("Not found");
    }

    const token = req.nextUrl.searchParams.get("token");

    const isVerified = jwt.verify(
      token!,
      process.env.VERIFICATION_TOKEN_SECRET!,
    );

    if (!isVerified) {
      throw new createHttpError.BadRequest("Inalid token");
    }

    await await invite.update({
      status: "accepted",
    });

    const user = await db.models.User.findOne({
      where: {
        userId: invite?.userId,
      },
    });

    const city = await db.models.City.findOne({
      where: { locode: invite.locode },
    });

    const cities = await user?.getCities();
    const isCityExits = cities?.find((c) => c.cityId === city?.cityId);

    if (isCityExits) {
      throw new createHttpError.BadRequest("User already exists in the city");
    }

    user?.addCity(city?.cityId);

    // return NextResponse.redirect("http://localhost:3000");
    return NextResponse.json({
      cities,
    });
  },
);
