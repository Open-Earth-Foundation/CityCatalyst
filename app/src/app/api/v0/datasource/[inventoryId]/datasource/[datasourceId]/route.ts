import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import UserService from "@/backend/UserService";

export const DELETE = apiHandler(async (_req, { params, session }) => {
  await UserService.findUserInventory(params.inventoryId, session);

  const inventoryValues = await db.models.InventoryValue.findAll({
    where: {
      datasourceId: params.datasourceId,
      inventoryId: params.inventoryId,
    },
  });
  if (inventoryValues.length === 0) {
    throw new createHttpError.NotFound("Inventory value not found");
  }

  await db.models.InventoryValue.destroy({
    where: {
      datasourceId: params.datasourceId,
      inventoryId: params.inventoryId,
    },
  });

  return NextResponse.json({ data: inventoryValues, deleted: true });
});
