import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { getEmissionsForecasts } from "@/backend/ResultsService";

export const GET = apiHandler(
  async (_req, { session, params: { inventory } }) => {
    // ensure inventory belongs to user
    const inventoryData = await UserService.findUserInventory(
      inventory,
      session,
      [],
      true,
    );
    const forecast = await getEmissionsForecasts(inventoryData);
    return NextResponse.json({
      data: forecast,
    });
  },
);
