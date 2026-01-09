import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

import createHttpError from "http-errors";
import VersionHistoryService from "@/backend/VersionHistoryService";

/**
 * @swagger
 * /api/v1/inventory/{inventory}/version-history:
 *   get:
 *     tags:
 *       - inventory
 *       - version-history
 *     operationId: getInventoryVersionHistory
 *     summary: Get data entry history for an inventory
 *     description: Retrieves data entry history information for an inventory, showing changes made by different users over time. Returns aggregated history entries to be shown in UI. Supports 'default' as inventory ID to use the user's default inventory. Requires authentication and access to the inventory.
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
  if (!session?.user.id) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  let inventoryId = params.inventory;
  if (inventoryId === "default") {
    const defaultInventoryId = await UserService.updateDefaults(
      session.user.id,
    );
    if (defaultInventoryId) {
      inventoryId = defaultInventoryId;
    }
  }
  if (!inventoryId) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  // perform access control
  await UserService.findUserInventory(inventoryId, session, [], true);

  const versionHistory =
    await VersionHistoryService.getVersionHistory(inventoryId);

  return NextResponse.json({
    data: versionHistory,
  });
});
