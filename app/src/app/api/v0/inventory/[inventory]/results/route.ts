/**
 * @swagger
 * /api/v0/inventory/{inventory}/results:
 *   get:
 *     tags:
 *       - Inventory Results
 *     summary: Get emissions results summary for an inventory
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Emissions totals and top emitters returned.
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
