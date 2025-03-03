import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import {
  getEmissionsBreakdown,
  SectorNamesInFE,
} from "@/backend/ResultsService";

export const GET = apiHandler(
  async (_req, { session, params: { inventory, sectorName } }) => {
    // ensure inventory belongs to user
    await UserService.findUserInventory(inventory, session, [], true);

    const emissionsBreakdown = await getEmissionsBreakdown(
      inventory,
      sectorName as SectorNamesInFE,
    );
    return NextResponse.json({
      data: emissionsBreakdown,
    });
  },
);
