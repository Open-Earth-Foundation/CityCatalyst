/**
 * @swagger
 * /api/v1/datasource/{inventoryId}/connect-all:
 *   post:
 *     tags:
 *       - data
 *       - sources
 *     operationId: postDatasourceInventoryidConnectAll
 *     summary: Auto-connect prioritized third-party data sources for an inventory.
 *     description: Applies the best applicable source per GPC reference for the inventory city and year.
 *     parameters:
 *       - in: path
 *         name: inventoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Connection completed; may include non-fatal fetch errors.
 */
import DataSourceConnectService from "@/backend/DataSourceConnectService";
import { PermissionService } from "@/backend/permissions";
import { db } from "@/models";
import { City } from "@/models/City";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const POST = apiHandler(async (_req, { params, session }) => {
  await PermissionService.canEditInventory(session, params.inventoryId);

  const inventory = await db.models.Inventory.findOne({
    where: { inventoryId: params.inventoryId },
    include: [{ model: City, as: "city" }],
  });
  if (!inventory?.city?.locode) {
    throw new createHttpError.NotFound("Inventory or city not found");
  }

  const errors = await DataSourceConnectService.connectAllForInventory(
    params.inventoryId,
    inventory.city.locode,
    session?.user.id,
  );

  return NextResponse.json({ errors });
});
