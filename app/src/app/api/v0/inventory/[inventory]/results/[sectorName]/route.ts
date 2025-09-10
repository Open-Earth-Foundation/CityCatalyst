/**
 * @swagger
 * /api/v0/inventory/{inventory}/results/{sectorName}:
 *   get:
 *     tags:
 *       - Inventory Results
 *     summary: Get emissions breakdown for a sector
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
 *         description: Emissions breakdown returned.
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
