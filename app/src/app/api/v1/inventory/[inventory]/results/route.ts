/**
 * @swagger
 * /api/v1/inventory/{inventory}/results:
 *   get:
 *     tags:
 *       - Inventory Results
 *     operationId: getInventoryInventoryResults
 *     summary: Get emissions totals by sector and top emitters for an inventory.
 *     description: Computes the inventory's total emissions and top sub-sector emitters. Requires a signed‑in user with access to the inventory. Response is wrapped in '{' data: { totalEmissions, topEmissions } '}'.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Results wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalEmissions:
 *                       type: object
 *                       properties:
 *                         bySector:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               sectorId:
 *                                 type: string
 *                                 format: uuid
 *                               sectorName:
 *                                 type: string
 *                               emissions:
 *                                 type: number
 *                               percentage:
 *                                 type: number
 *                         total:
 *                           type: number
 *                     topEmissions:
 *                       type: object
 *                       properties:
 *                         bySubSector:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               subsectorId:
 *                                 type: string
 *                                 format: uuid
 *                               subsectorName:
 *                                 type: string
 *                               sectorName:
 *                                 type: string
 *                               emissions:
 *                                 type: number
 *                               percentage:
 *                                 type: number
 */
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { getEmissionResults } from "@/backend/ResultsService";

export const GET = apiHandler(
  async (_req, { session, params: { inventory } }) => {
    // ensure inventory belongs to user (read-only access)
    await PermissionService.canAccessInventory(session, inventory);

    const { totalEmissionsBySector, topEmissionsBySubSector, totalEmissions } =
      await getEmissionResults(inventory);

    return NextResponse.json({
      data: {
        totalEmissions: {
          bySector: totalEmissionsBySector || [],
          total: totalEmissions || 0,
        },
        topEmissions: { bySubSector: topEmissionsBySubSector || [] },
      },
    });
  },
);