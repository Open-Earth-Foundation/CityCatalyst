/**
 * @swagger
 * /api/v1/inventory/{inventory}/results/emissions-forecast:
 *   get:
 *     tags:
 *       - inventory
 *       - results
 *     operationId: getInventoryResultsEmissionsForecast
 *     summary: Get emissions forecast with confidence metrics for an inventory.
 *     description: Generates and returns emissions forecast data for the specified inventory using advanced forecasting models. Includes yearly predictions with confidence levels and methodology information. Requires a signed‑in user with read access to the inventory. Response is wrapped in '{' data '}'.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Inventory ID for which to generate emissions forecast
 *     responses:
 *       200:
 *         description: Emissions forecast data wrapped in data object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     forecast:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           year:
 *                             type: integer
 *                             description: Forecast year
 *                           emissions:
 *                             type: number
 *                             description: Predicted CO2 equivalent emissions for the year
 *                           confidence:
 *                             type: number
 *                             minimum: 0
 *                             maximum: 1
 *                             description: Confidence level of the forecast (0-1, where 1 is highest confidence)
 *                     methodology:
 *                       type: string
 *                       description: Forecasting methodology used
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp of when forecast was generated
 *                   description: Emissions forecast data with methodology and confidence metrics
 *       401:
 *         description: Unauthorized - user lacks access to the inventory.
 *       404:
 *         description: Inventory not found.
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
