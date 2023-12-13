import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(
  async (
    _req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const { params, session } = context;

    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    const city = await db.models.City.findOne({
      where: { locode: params.city },
      include: [
        {
          model: db.models.User,
          as: "users",
        },
        {
          model: db.models.Population,
          as: "populations",
        },
      ],
    });

    if (!city) {
      throw new createHttpError.NotFound("User is not part of this city");
    }

    return NextResponse.json({ data: city });
  },
);

export const DELETE = apiHandler(
  async (
    _req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const { params, session } = context;
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    const city = await db.models.City.findOne({
      where: { locode: params.city },
      include: [
        {
          model: db.models.User,
          as: "users",
          // where: {
          //   userId: session.user.id,
          // },
        },
      ],
    });
    if (!city) {
      throw new createHttpError.NotFound("User is not part of this city");
    }

    await city.destroy();
    return NextResponse.json({ data: city, deleted: true });
  },
);

export const PATCH = apiHandler(
  async (
    req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const body = createCityRequest.parse(await req.json());
    const { params, session } = context;
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");

    let city = await db.models.City.findOne({
      where: { locode: params.city },
      include: [
        {
          model: db.models.User,
          as: "users",
          // where: {
          //   userId: session.user.id,
          // },
        },
      ],
    });
    if (!city) {
      throw new createHttpError.NotFound("User is not part of this city");
    }

    city = await city.update(body);
    return NextResponse.json({ data: city });
  },
);
