/**
 * @swagger
 * /api/v1/inventory/{inventory}/results/{sectorName}:
 *   get:
 *     tags:
 *       - inventory
 *       - results
 *     operationId: getInventoryResultsSectorName
 *     summary: Get emissions breakdown for a specific sector.
 *     description: Computes the breakdown for the chosen sector (by name) within the inventory. Requires a signed‑in user with access to the inventory. Response is wrapped in '{' data '}' (shape depends on sector).
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: sectorName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Breakdown wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     sectorName:
 *                       type: string
 *                     year:
 *                       type: number
 *                     totalEmissions:
 *                       type: number
 *                     subsectorResults:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           subsectorId:
 *                             type: string
 *                             format: uuid
 *                           subsectorName:
 *                             type: string
 *                           emissions:
 *                             type: number
 *                           percentage:
 *                             type: number
 *                     byScope:
 *                       type: array
 *                       description: Rows counted in BASIC/BASIC+ totals.
 *                       items:
 *                         type: object
 *                     grossTotalEmissions:
 *                       type: string
 *                       description: Sum of non-negative byScope rows, the percentage denominator.
 *                     omittedFromTotal:
 *                       type: array
 *                       description: Stored rows left out of BASIC/BASIC+ totals, such as III.x.3 and VI.1. They are in no total or percentage. Use sectorName other-scope-3 for VI.1.
 *                       items:
 *                         type: object
 *                         properties:
 *                           gpcReferenceNumber:
 *                             type: string
 *                             nullable: true
 *                           activityTitle:
 *                             type: string
 *                           totalEmissions:
 *                             type: string
 *                           percentage:
 *                             type: number
 *                             nullable: true
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 */
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import {
  getEmissionsBreakdown,
  SectorNamesInFE,
} from "@/backend/ResultsService";

export const GET = apiHandler(
  async (_req, { session, params: { inventory, sectorName } }) => {
    // ensure inventory belongs to user (read-only access)
    await PermissionService.canAccessInventory(session, inventory);

    const emissionsBreakdown = await getEmissionsBreakdown(
      inventory,
      sectorName as SectorNamesInFE,
    );
    return NextResponse.json({
      data: emissionsBreakdown,
    });
  },
);
