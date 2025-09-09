import { PermissionService } from "@/backend/permissions/PermissionService";
import { ModuleDashboardService } from "@/backend/ModuleDashboardService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Modules } from "@/util/constants";
import createHttpError from "http-errors";
import { Inventory } from "@/models/Inventory";

const paramsSchema = z.object({
  city: z.string().uuid("City ID must be a valid UUID"),
});

const querySchema = z.object({
  inventoryId: z.string().uuid("Inventory ID must be a valid UUID"),
});

export const GET = apiHandler(async (req: Request, context) => {
  const { city: cityId } = paramsSchema.parse(context.params);
  const { session } = context;

  const searchParams = new URL(req.url).searchParams;
  const { inventoryId } = querySchema.parse({
    inventoryId: searchParams.get("inventoryId"),
  });

  // Check if user can access this inventory (handles public inventories automatically)
  const { resource } = await PermissionService.canAccessInventory(
    session,
    inventoryId,
    { includeResource: true },
  );

  const inventory = resource as Inventory;

  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  // Verify the inventory belongs to the requested city
  if (inventory.cityId !== cityId) {
    throw new createHttpError.BadRequest(
      "Inventory does not belong to the specified city",
    );
  }

  // Get CCRA dashboard data for the specific inventory
  const ccraData = await ModuleDashboardService.getCCRADashboardData(
    cityId,
    inventory,
  );

  return NextResponse.json({
    data: ccraData,
    metadata: {
      cityId,
      inventoryId,
      year: inventory.year,
      moduleId: Modules.CCRA.id,
    },
  });
});