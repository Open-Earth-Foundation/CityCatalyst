import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { getEmissionsForecasts } from "@/backend/ResultsService";

export const GET = apiHandler(
  async (_req, { session, params: { inventory } }) => {
    // ensure inventory belongs to user (read-only access with resource)
    const { resource: inventoryData } = await PermissionService.canAccessInventory(
      session,
      inventory
    );
    const forecast = await getEmissionsForecasts(inventoryData);
    return NextResponse.json({
      data: forecast,
    });
  },
);
