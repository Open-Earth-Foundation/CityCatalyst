/**
 * @swagger
 * /api/v0/inventory/{inventory}/results/emissions-forecast:
 *   get:
 *     tags:
 *       - Inventory Results
 *     summary: Get an emissions forecast derived from the inventory.
 *     description: Returns a forecast model output for the given inventory. Requires a signed‑in user with access to the inventory. Response is wrapped in { data } (model-dependent shape).
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Forecast wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: object, additionalProperties: true }
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
