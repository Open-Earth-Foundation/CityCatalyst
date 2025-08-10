import { PermissionService } from "@/backend/permissions/PermissionService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import {
  getEmissionsBreakdown,
  SectorNamesInFE,
} from "@/backend/ResultsService";

export const GET = apiHandler(
  async (_req, { session, params: { inventory, sectorName } }) => {
    // ensure inventory belongs to user (read-only access)
    await PermissionService.canAccessInventory(session, inventory, { excludeResource: true });

    const emissionsBreakdown = await getEmissionsBreakdown(
      inventory,
      sectorName as SectorNamesInFE,
    );
    return NextResponse.json({
      data: emissionsBreakdown,
    });
  },
);
