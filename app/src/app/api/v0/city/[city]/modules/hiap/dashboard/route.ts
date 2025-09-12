/**
 * @swagger
 * /api/v0/city/{city}/modules/hiap/dashboard:
 *   get:
 *     tags:
 *       - City Modules
 *     summary: Get HIAP dashboard data for a city inventory
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: inventoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: lng
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: HIAP dashboard data returned.
 *       400:
 *         description: Inventory does not belong to city.
 *       404:
 *         description: Inventory not found.
 */
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
  lng: z.string().optional(),
});

export const GET = apiHandler(async (req: Request, context) => {
  const { city: cityId } = paramsSchema.parse(context.params);
  const { session } = context;

  const searchParams = new URL(req.url).searchParams;
  const { inventoryId, lng = "en" } = querySchema.parse({
    inventoryId: searchParams.get("inventoryId"),
    lng: searchParams.get("lng"),
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

  // Get HIAP dashboard data for the specific inventory
  const hiapData = await ModuleDashboardService.getHIAPDashboardData(
    cityId,
    inventory,
    lng,
  );

  return NextResponse.json({
    data: hiapData,
    metadata: {
      cityId,
      inventoryId,
      year: inventory.year,
      moduleId: Modules.HIAP.id,
    },
  });
});
