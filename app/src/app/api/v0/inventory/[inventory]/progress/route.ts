import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

import InventoryProgressService from "@/backend/InventoryProgressService";

export const GET = apiHandler(async (_req, { session, params }) => {
  let inventoryId = params.inventory;

  if (inventoryId === "default") {
    inventoryId = await UserService.findUserDefaultInventory(session);
  }
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

  const progressData =
    await InventoryProgressService.getInventoryProgress(inventory);

  return NextResponse.json({
    data: progressData,
  });
});
