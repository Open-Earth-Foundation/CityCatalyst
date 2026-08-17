/**
 * @swagger
 * /api/v1/internal/ca/capabilities/hiap/inventory/context:
 *   post:
 *     tags:
 *       - internal
 *     operationId: postInternalCaHiapInventoryContext
 *     summary: Load compact persisted HIAP context for Climate Advisor
 *     description: Read-only internal capability. It verifies service and user access, then returns selected actions or all persisted ranked actions as a fallback. It never starts prioritization or writes HIAP state.
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
 *               language:
 *                 type: string
 *                 enum: [en, es, pt, de, fr]
 *                 default: en
 *     responses:
 *       200:
 *         description: Persisted HIAP context returned successfully.
 *       400:
 *         description: Invalid body or inventory/city scope mismatch.
 *       401:
 *         description: Missing or invalid Climate Advisor service authentication.
 *       403:
 *         description: Authenticated user cannot access the inventory.
 *       404:
 *         description: Feature disabled or inventory not found.
 */

import createHttpError from "http-errors";
import { NextResponse } from "next/server";

import { buildHiapInventoryContext } from "@/backend/agentic/hiap/context";
import {
  HIAP_INVENTORY_CONTEXT_CAPABILITY,
  hiapInventoryContextInputSchema,
} from "@/backend/agentic/hiap/registry";
import {
  requireClimateAdvisorIntegrationEnabled,
  requireClimateAdvisorServiceRequest,
} from "@/backend/agentic/ghgi/stationary-energy/auth";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { Inventory } from "@/models/Inventory";
import { apiHandler } from "@/util/api";

export const POST = apiHandler(async (req, { session }) => {
  requireClimateAdvisorIntegrationEnabled();
  requireClimateAdvisorServiceRequest(req);

  const body = hiapInventoryContextInputSchema.parse(await req.json());
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
    action: HIAP_INVENTORY_CONTEXT_CAPABILITY,
    success: true,
    data: await buildHiapInventoryContext(inventory.inventoryId, body.language),
  });
});
