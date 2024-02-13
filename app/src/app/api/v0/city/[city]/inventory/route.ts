import CityService from "@/backend/CityService";
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
    { session, params }: { session?: Session; params: Record<string, string> },
  ) => {
    const body = createInventoryRequest.parse(await req.json());

    const city = await CityService.findUserCity(params.city, session);
    const inventory = await db.models.Inventory.create({
      ...body,
      inventoryId: randomUUID(),
      cityId: city.cityId,
    });
    return NextResponse.json({ data: inventory });
  },
);

export const GET = apiHandler(
  async (
    _req: NextRequest,
    { session, params }: { session?: Session; params: Record<string, string> },
  ) => {
    const city = await CityService.findUserCity(params.city, session);
    const inventory = await db.models.Inventory.findAll({
      where: { cityId: city?.cityId },
    });

    if (!inventory) {
      throw new createHttpError.BadRequest("Something went wrong!");
    }

    return NextResponse.json({ data: inventory });
  },
);
