import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createInventoryRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { City } from "@/models/City";

export const POST = apiHandler(
  async (req: NextRequest, { session, params }) => {
    const body = createInventoryRequest.parse(await req.json());

    // Check permission to create inventory in this city (ORG_ADMIN or PROJECT_ADMIN required)
    const { resource: city } = await PermissionService.canCreateInventory(
      session,
      params.city,
    );

    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }

    let didExistAlready = true;
    let inventory = await db.models.Inventory.findOne({
      where: {
        cityId: (city as City)?.cityId,
        year: body.year,
      },
    });

    if (!inventory) {
      inventory = await db.models.Inventory.create({
        ...body,
        inventoryId: randomUUID(),
        cityId: (city as City)?.cityId,
      });
      didExistAlready = false;
    }
    return NextResponse.json({ data: inventory, didExistAlready });
  },
);

export const GET = apiHandler(
  async (_req: NextRequest, { session, params }) => {
    // Check permission to access city
    const { resource: city } = await PermissionService.canAccessCity(
      session,
      params.city,
    );
    const inventory = await db.models.Inventory.findAll({
      where: { cityId: (city as City)?.cityId },
    });

    if (!inventory) {
      throw new createHttpError.BadRequest("Something went wrong!");
    }

    return NextResponse.json({ data: inventory });
  },
);
