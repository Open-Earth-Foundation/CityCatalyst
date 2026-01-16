import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";

import VersionHistoryService from "@/backend/VersionHistoryService";
import { PermissionService } from "@/backend/permissions/PermissionService";

/**
 * @swagger
 * /api/v1/inventory/{inventory}/version-history/restore/{version}:
 *   post:
 *     tags:
 *       - inventory
 *       - version-history
 *     operationId: restoreVersion
 *     summary: Restore a previous version of an inventory
 *     description: Jumps back to a previous version, restoring the previous version of each changed entry or deleting them if they weren't present before. Version entries made after the given version are deleted, so there is no undo. Inventory parameter is used for access control.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: version
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Version restored successfully.
 *       401:
 *         description: Access control failed (not allowed).
 *       404:
 *         description: Version not found.
 */
export const POST = apiHandler(async (_req, { session, params }) => {
  let inventoryId = params.inventory;
  let versionId = z.string().uuid().parse(params.version);

  // perform access control
  await PermissionService.canEditInventory(session, inventoryId);

  await VersionHistoryService.restoreVersion(versionId);

  return NextResponse.json({
    success: true,
  });
});
