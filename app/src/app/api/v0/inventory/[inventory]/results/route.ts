import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { getEmissionResults } from "@/backend/ResultsService";

export const GET = apiHandler(
  async (_req, { session, params: { inventory } }) => {
    // ensure inventory belongs to user
    await UserService.findUserInventory(inventory, session, [], true);

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
