import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

import VersionHistoryService from "@/backend/VersionHistoryService";
import { PermissionService } from "@/backend/permissions/PermissionService";

/**
 * @swagger
 * /api/v1/inventory/{inventory}/version-history:
 *   get:
 *     tags:
 *       - inventory
 *       - version-history
 *     operationId: getInventoryVersionHistory
 *     summary: Get data entry history for an inventory
 *     description: Retrieves data entry history information for an inventory, showing changes made by different users over time. Returns aggregated history entries to be shown in UI. Requires authentication and access to the inventory.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Inventory history entries returned.
 *       401:
 *         description: Access control failed (not allowed).
 *       404:
 *         description: Inventory not found.
 */
export const GET = apiHandler(async (_req, { session, params }) => {
  let inventoryId = params.inventory;

  // perform access control
  await PermissionService.canAccessInventory(session, inventoryId);

  const versionHistory =
    await VersionHistoryService.getVersionHistory(inventoryId);

  return NextResponse.json({
    data: versionHistory,
  });
});
