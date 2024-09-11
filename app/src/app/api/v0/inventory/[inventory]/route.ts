import { NextResponse } from "next/server";

import { apiHandler } from "@/util/api";
import { db } from "@/models";
import createHttpError from "http-errors";
import UserService from "@/backend/UserService";
import { createInventoryRequest } from "@/util/validation";

export const GET = apiHandler(async (req, { params }) => {
  const { inventory: inventoryId } = params;
  const inventory = await db.models.Inventory.findByPk(inventoryId, {
    include: [{ model: db.models.City, as: "city" }],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

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
  const body = createInventoryRequest.parse(await req.json());

  let inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );
  inventory = await inventory.update(body);
  return NextResponse.json({ data: inventory });
});
