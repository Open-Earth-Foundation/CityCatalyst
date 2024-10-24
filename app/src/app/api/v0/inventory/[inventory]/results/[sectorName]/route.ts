import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { getEmissionsBreakdown } from "@/backend/ResultsService";

export const GET = apiHandler(
  async (_req, { session, params: { inventory, sectorName } }) => {
    // ensure inventory belongs to user
    await UserService.findUserInventory(
      inventory,
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

    const emissionsBreakdown = await getEmissionsBreakdown(
      inventory,
      sectorName,
    );
    return NextResponse.json({
      data: emissionsBreakdown,
    });
  },
);
