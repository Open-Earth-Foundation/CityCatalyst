import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(
  async (
    req: Request,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const body = createCityRequest.parse(await req.json());
    if (!context.session) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }

    const city = await db.models.City.create({
      cityId: randomUUID(),
      ...body,
    });
    await city.addUser(context.session.user.id);
    return NextResponse.json({ data: city });
  },
);

export const GET = apiHandler(
  async (
    _req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const { session } = context;

    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    const cities = await db.models.City.findAll({
      include: [
        {
          model: db.models.User,
          as: "users",
          where: {
            userId: session.user.id,
          },
          attributes: ["userId"],
        },
      ],
    });

    if (!cities) {
      throw new createHttpError.NotFound("User is not part of this city");
    }

    return NextResponse.json({ data: cities });
  },
);
