import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createInventoryRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(
  async (req: NextRequest, { session, params }) => {
    const body = createInventoryRequest.parse(await req.json());

    const city = await UserService.findUserCity(params.city, session);
    let didExistAlready = true;
    let inventory = await db.models.Inventory.findOne({
      where: {
        cityId: city.cityId,
        year: body.year,
      },
    });

    if (!inventory) {
      inventory = await db.models.Inventory.create({
        ...body,
        globalWarmingPotentialType: body.globalWarmingPotentialType!,
        inventoryType: body.inventoryGoal,
        inventoryId: randomUUID(),
        cityId: city.cityId,
      });
      didExistAlready = false;
    }
    return NextResponse.json({ data: inventory, didExistAlready });
  },
);

export const GET = apiHandler(
  async (_req: NextRequest, { session, params }) => {
    const city = await UserService.findUserCity(params.city, session);
    const inventory = await db.models.Inventory.findAll({
      where: { cityId: city?.cityId },
    });

    if (!inventory) {
      throw new createHttpError.BadRequest("Something went wrong!");
    }

    return NextResponse.json({ data: inventory });
  },
);
