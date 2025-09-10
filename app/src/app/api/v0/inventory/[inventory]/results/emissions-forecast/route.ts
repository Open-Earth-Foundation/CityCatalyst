/**
 * @swagger
 * /api/v0/inventory/{inventory}/results/emissions-forecast:
 *   get:
 *     tags:
 *       - Inventory Results
 *     summary: Get emissions forecast for an inventory
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Forecast data returned.
 */
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { getEmissionsForecasts } from "@/backend/ResultsService";
import { Inventory } from "@/models/Inventory";

export const GET = apiHandler(
  async (_req, { session, params: { inventory } }) => {
    // ensure inventory belongs to user (read-only access with resource)
    const { resource } = await PermissionService.canAccessInventory(
      session,
      inventory,
    );

    const inventoryData = resource as Inventory;

    const forecast = await getEmissionsForecasts(inventoryData);
    return NextResponse.json({
      data: forecast,
    });
  },
);
