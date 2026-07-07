/**
 * @swagger
 * /api/v1/internal/ca/capabilities/ghgi/inventory/status-overview:
 *   post:
 *     tags:
 *       - internal
 *     operationId: postInternalCaInventoryStatusOverview
 *     summary: Load compact GHGI inventory status for Climate Advisor
 *     description: Internal Climate Advisor capability route. Requires service-to-service headers plus a user-scoped bearer token, then verifies the requested user can read the inventory.
 *     parameters:
 *       - in: header
 *         name: X-Service-Name
 *         required: true
 *         schema:
 *           type: string
 *           enum: [climate-advisor]
 *       - in: header
 *         name: X-Service-Key
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *           example: Bearer <user-scoped-token>
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [city_id, inventory_id]
 *             properties:
 *               city_id:
 *                 type: string
 *                 format: uuid
 *               inventory_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Inventory status overview returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 action:
 *                   type: string
 *                   enum: [ghgi.inventory.status_overview]
 *                 success:
 *                   type: boolean
 *                   enum: [true]
 *                 data:
 *                   type: object
 *                   properties:
 *                     city:
 *                       type: string
 *                     inventory:
 *                       type: object
 *                     completion:
 *                       type: object
 *                     by_sector:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Invalid request body or inventory/city scope mismatch.
 *       401:
 *         description: Missing or invalid Climate Advisor service authentication.
 *       403:
 *         description: Authenticated user cannot access the inventory.
 *       404:
 *         description: Feature disabled or inventory not found.
 */

import createHttpError from "http-errors";
import { NextResponse } from "next/server";

import { buildInventoryStatusOverview } from "@/backend/agentic/ghgi/inventory/context";
import {
  INVENTORY_STATUS_OVERVIEW_CAPABILITY,
  inventoryCapabilityInputSchema,
} from "@/backend/agentic/ghgi/inventory/registry";
import {
  requireClimateAdvisorServiceRequest,
  requireStationaryEnergyAgenticEnabled,
} from "@/backend/agentic/ghgi/stationary-energy/auth";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { Inventory } from "@/models/Inventory";
import { apiHandler } from "@/util/api";

export const POST = apiHandler(async (req, { session }) => {
  requireStationaryEnergyAgenticEnabled();
  requireClimateAdvisorServiceRequest(req);

  const body = inventoryCapabilityInputSchema.parse(await req.json());

  const { resource } = await PermissionService.canAccessInventory(
    session,
    body.inventory_id,
  );
  const inventory = resource as Inventory;
  if (!inventory || inventory.cityId !== body.city_id) {
    throw new createHttpError.BadRequest(
      "Inventory does not belong to the requested city",
    );
  }

  return NextResponse.json({
    action: INVENTORY_STATUS_OVERVIEW_CAPABILITY,
    success: true,
    data: await buildInventoryStatusOverview(inventory),
  });
});
