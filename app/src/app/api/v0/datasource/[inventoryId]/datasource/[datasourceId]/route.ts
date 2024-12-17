import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import UserService from "@/backend/UserService";

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const inventory = await UserService.findUserInventory(
    params.inventoryId,
    session,
  );

  const subcategoryValue = await db.models.InventoryValue.findOne({
    where: {
      datasourceId: params.datasourceId,
      inventoryId: params.inventoryId,
    },
  });
  if (!subcategoryValue) {
    throw new createHttpError.NotFound("Inventory value not found");
  }

  await subcategoryValue.destroy();

  return NextResponse.json({ data: subcategoryValue, deleted: true });
});
