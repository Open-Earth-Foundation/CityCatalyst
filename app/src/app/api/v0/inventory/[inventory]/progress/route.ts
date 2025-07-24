import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

import InventoryProgressService from "@/backend/InventoryProgressService";
import createHttpError from "http-errors";

export const GET = apiHandler(async (_req, { session, params }) => {
  if (!session?.user.id) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  let inventoryId = params.inventory;

  const inventory = await UserService.findUserInventory(
    inventoryId,
    session,
    [
      {
        model: db.models.InventoryValue,
        as: "inventoryValues",
        include: [
          {
            model: db.models.DataSource,
            attributes: ["datasourceId", "sourceType"],
            as: "dataSource",
          },
        ],
      },
    ],
    true,
  );
  if (inventoryId === "default") {
    inventoryId = await UserService.updateDefaults(session.user.id);
  }
  const progressData =
    await InventoryProgressService.getInventoryProgress(inventory);

  return NextResponse.json({
    data: progressData,
  });
});
