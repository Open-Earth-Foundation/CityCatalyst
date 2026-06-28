/**
 * @swagger
 * /api/v1/internal/ca/capabilities/ghgi/inventory/list-accessible:
 *   post:
 *     tags:
 *       - internal
 *     operationId: postInternalCaInventoryListAccessible
 *     summary: List accessible GHGI inventories for Climate Advisor
 *     description: Internal Climate Advisor capability route. Requires service-to-service headers plus a user-scoped bearer token, then returns the city/year inventories the requested user can access.
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
 *             required: [user_id]
 *             properties:
 *               user_id:
 *                 type: string
 *                 format: uuid
 *               city_query:
 *                 type: string
 *               year:
 *                 type: integer
 *               include_all_city_years:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Accessible inventory choices returned successfully.
 *       401:
 *         description: Missing or invalid Climate Advisor service authentication.
 *       403:
 *         description: Authenticated user does not match the requested user.
 *       404:
 *         description: Feature disabled or user not found.
 */

import { NextResponse } from "next/server";

import { buildAccessibleInventoryList } from "@/backend/agentic/ghgi/inventory/context";
import {
  INVENTORY_LIST_ACCESSIBLE_CAPABILITY,
  inventoryListAccessibleInputSchema,
} from "@/backend/agentic/ghgi/inventory/registry";
import {
  requireClimateAdvisorServiceRequest,
  requireRequestUser,
  requireStationaryEnergyAgenticEnabled,
} from "@/backend/agentic/ghgi/stationary-energy/auth";
import { apiHandler } from "@/util/api";

export const POST = apiHandler(async (req, { session }) => {
  requireStationaryEnergyAgenticEnabled();
  requireClimateAdvisorServiceRequest(req);

  const body = inventoryListAccessibleInputSchema.parse(await req.json());
  requireRequestUser(session, body.user_id);

  return NextResponse.json({
    action: INVENTORY_LIST_ACCESSIBLE_CAPABILITY,
    success: true,
    data: await buildAccessibleInventoryList({
      userId: body.user_id,
      cityQuery: body.city_query,
      year: body.year,
      includeAllCityYears: body.include_all_city_years,
    }),
  });
});
