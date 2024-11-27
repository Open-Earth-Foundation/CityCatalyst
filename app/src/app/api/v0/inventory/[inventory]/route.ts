import { NextResponse } from "next/server";

import { apiHandler } from "@/util/api";
import { db } from "@/models";
import createHttpError from "http-errors";
import UserService from "@/backend/UserService";
import { upsertInventoryRequest } from "@/util/validation";
import { QueryTypes } from "sequelize";

function hasIsPublicProperty(
  inventory:
    | {
        inventoryName: string;
        year: number;
        totalEmissions?: number;
        totalCountryEmissions?: number;
      }
    | { isPublic?: boolean },
): inventory is { isPublic: boolean } {
  return (inventory as { isPublic: boolean }).isPublic !== undefined;
}

export const GET = apiHandler(async (req, { session, params }) => {
  let inventoryId = params.inventory;

  let inventory;
  if ("default" === inventoryId) {
    inventoryId = await UserService.findUserDefaultInventory(session);
  }
  inventory = await UserService.findUserInventory(
    inventoryId,
    session,
    [{ model: db.models.City, as: "city" }],
    true,
  );

  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  // TODO [ON-2429]: Save total emissions for inventory every time activity data is modified
  const rawQuery = `  
    SELECT SUM(co2eq)  
    FROM "InventoryValue"  
    WHERE inventory_id = :inventoryId  
  `;

  const [{ sum }] = (await db.sequelize!.query(rawQuery, {
    replacements: { inventoryId },
    type: QueryTypes.SELECT,
    raw: true,
  })) as unknown as { sum: number }[];

  inventory.totalEmissions = sum;
  return NextResponse.json({ data: inventory });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );
  await inventory.destroy();
  return NextResponse.json({ data: inventory, deleted: true });
});

export const PATCH = apiHandler(async (req, context) => {
  const { params, session } = context;
  const body = upsertInventoryRequest.parse(await req.json());
  let inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  if (hasIsPublicProperty(body)) {
    const publishBody: { isPublic: boolean; publishedAt?: Date | null } = {
      ...body,
    };
    if (publishBody.isPublic && !inventory.isPublic) {
      publishBody.publishedAt = new Date();
    } else if (!publishBody.isPublic) {
      publishBody.publishedAt = null;
    }
    await inventory.update(publishBody);
  }
  inventory = await inventory.update(body);
  return NextResponse.json({ data: inventory });
});
