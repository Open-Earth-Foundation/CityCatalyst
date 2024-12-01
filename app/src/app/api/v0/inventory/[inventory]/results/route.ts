import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { getEmissionResults } from "@/backend/ResultsService";

export const GET = apiHandler(
  async (_req, { session, params: { inventory } }) => {
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

    const { totalEmissionsBySector, topEmissionsBySubSector, totalEmissions } =
      await getEmissionResults(inventory);

    return NextResponse.json({
      data: {
        totalEmissions: {
          bySector: totalEmissionsBySector,
          total: totalEmissions,
        },
        topEmissions: { bySubSector: topEmissionsBySubSector },
      },
    });
  },
);
