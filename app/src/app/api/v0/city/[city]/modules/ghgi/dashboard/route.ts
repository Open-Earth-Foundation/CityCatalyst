/**
 * @swagger
 * /api/v0/city/{city}/modules/ghgi/dashboard:
 *   get:
 *     tags:
 *       - City Modules
 *     summary: Get Greenhouse Gas Inventory (GHGI) dashboard data for a city inventory
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
 *     responses:
 *       200:
 *         description: GHGI dashboard data returned.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   description: GHGI dashboard data
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     cityId:
 *                       type: string
 *                       format: uuid
 *                     inventoryId:
 *                       type: string
 *                       format: uuid
 *                     year:
 *                       type: integer
 *                     moduleId:
 *                       type: string
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

  // Get GHGI dashboard data for the specific inventory
  const ghgiData = await ModuleDashboardService.getGHGIDashboardData(
    cityId,
    inventory,
  );

  return NextResponse.json({
    data: ghgiData,
    metadata: {
      cityId,
      inventoryId,
      year: inventory.year,
      moduleId: Modules.GHGI.id,
    },
  });
});
