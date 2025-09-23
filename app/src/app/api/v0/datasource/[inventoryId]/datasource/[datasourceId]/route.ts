/**
 * @swagger
 * /api/v0/datasource/{inventoryId}/datasource/{datasourceId}:
 *   get:
 *     tags:
 *       - Data Sources
 *     summary: Get a single data source with scaled data for an inventory (edit access).
 *     parameters:
 *       - in: path
 *         name: inventoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: datasourceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Data source with data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       404:
 *         description: Inventory or data source not found.
 *   delete:
 *     tags:
 *       - Data Sources
 *     summary: Disconnect a data source and remove related inventory values (edit access).
 *     parameters:
 *       - in: path
 *         name: inventoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: datasourceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Deleted values and deleted flag.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { type: object, additionalProperties: true }
 *                 deleted:
 *                   type: boolean
 *       404:
 *         description: Inventory value not found.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { PermissionService } from "@/backend/permissions/PermissionService";

import { City } from "@/models/City";
import DataSourceService from "@/backend/DataSourceService";

/** disconnects a datasource from an inventory */
export const DELETE = apiHandler(async (_req, { params, session }) => {
  await PermissionService.canEditInventory(session, params.inventoryId);

  const inventoryValues = await db.models.InventoryValue.findAll({
    where: {
      datasourceId: params.datasourceId,
      inventoryId: params.inventoryId,
    },
  });
  if (inventoryValues.length === 0) {
    throw new createHttpError.NotFound("Inventory value not found");
  }

  await db.models.InventoryValue.destroy({
    where: {
      datasourceId: params.datasourceId,
      inventoryId: params.inventoryId,
    },
  });

  return NextResponse.json({ data: inventoryValues, deleted: true });
});

/** gets a datasource from an inventory and scales it if necessary */
export const GET = apiHandler(async (_req, { params, session }) => {
  await PermissionService.canEditInventory(session, params.inventoryId);

  const inventory = await db.models.Inventory.findOne({
    where: { inventoryId: params.inventoryId },
    include: [{ model: City, as: "city" }],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const source = await DataSourceService.findSource(
    params.inventoryId,
    params.datasourceId,
  );
  if (!source) {
    throw new createHttpError.NotFound("Data source not found");
  }

  const {
    countryPopulationScaleFactor,
    regionPopulationScaleFactor,
    populationIssue,
  } = await DataSourceService.findPopulationScaleFactors(inventory, [source]);
  const sourceData = await DataSourceService.getSourceWithData(
    source,
    inventory,
    countryPopulationScaleFactor,
    regionPopulationScaleFactor,
    populationIssue,
  );
  return NextResponse.json(sourceData);
});
