import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

import type { Sector } from "@/models/Sector";
import InventoryProgressService from "@/backend/InventoryProgressService";
import createHttpError from "http-errors";

// sort whole inventory by GPC reference number
function romanNumeralComparison(sectorA: Sector, sectorB: Sector) {
  const a = sectorA.referenceNumber || "";
  const b = sectorB.referenceNumber || "";

  const romanTable: Record<string, number> = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    "": 1337,
  };

  return romanTable[a] - romanTable[b];
}

export const GET = apiHandler(async (_req, { session, params }) => {
  const inventory = await UserService.findUserInventory(
    params.inventory,
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
  );

  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const progressData =
    await InventoryProgressService.getInventoryProgress(inventory);

  return NextResponse.json({
    data: progressData,
  });
});
