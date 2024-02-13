import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createInventoryRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(
  async (
    req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const body = createInventoryRequest.parse(await req.json());
    const { session } = context;
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    const city = await db.models.City.findOne({
      where: {
        cityId: body.cityId,
      },
      include: [
        {
          model: db.models.User,
          as: "users",
          where: {
            userId: session.user.id,
          },
        },
      ],
    });
    if (!city || city.users.length === 0) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }
    const inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      ...body,
    });
    return NextResponse.json({ data: inventory });
  },
);

export const GET = apiHandler(
  async (
    req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const { params, session } = context;
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    const city = await db.models.City.findOne({
      where: {
        locode: params.city,
      },
    });
    const inventory = await db.models.Inventory.findAll({
      where: { cityId: city?.cityId },
    });

    if (!inventory) {
      throw new createHttpError.BadRequest("Something went wrong!");
    }

    return NextResponse.json({ data: inventory });
  },
);
