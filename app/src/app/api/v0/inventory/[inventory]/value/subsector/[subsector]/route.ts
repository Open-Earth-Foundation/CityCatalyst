import { apiHandler } from "@/util/api";
import { db } from "@/models";
import UserService from "@/backend/UserService";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req, { params, session }) => {
  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );
  const inventoryValues = await db.models.InventoryValue.findAll({
    where: {
      subSectorId: params.subsector,
      inventoryId: inventory.inventoryId,
    },
    include: [
      { model: db.models.DataSource, as: "dataSource" },
      {
        model: db.models.SubCategory,
        as: "subCategory",
      },
      { model: db.models.Sector, as: "sector" },
      { model: db.models.SubSector, as: "subSector" },
    ],
  });

  return NextResponse.json({ data: inventoryValues });
});
