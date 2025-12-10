/**
 * @swagger
 * /api/v1/datasource/{inventoryId}/datasource/{datasourceId}:
 *   delete:
 *     tags:
 *       - Data Sources
 *     operationId: deleteDatasourceInventoryIdDatasource
 *     summary: Disconnect a data source and remove related inventory values (edit access).
 *     parameters:
 *       - in: path
 *         name: inventoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Inventory ID to remove data source from
 *       - in: path
 *         name: datasourceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Data source ID to disconnect
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
 *                   items:
 *                     type: object
 *                     properties:
 *                       datasourceId:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       data:
 *                         type: object
 *                         additionalProperties: true
 *                         description: Fetched data from the data source
 *                       error:
 *                         type: string
 *                         nullable: true
 *                         description: Error message if data fetch failed
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

/**
 * @swagger
 * /api/v1/datasource/{inventoryId}/datasource/{datasourceId}:
 *   get:
 *     tags:
 *       - Data Sources
 *     operationId: getDatasourceInventoryIdDatasource
 *     summary: Get a single data source with scaled data for an inventory (edit access).
 *     parameters:
 *       - in: path
 *         name: inventoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Inventory ID to retrieve data source for
 *       - in: path
 *         name: datasourceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Data source ID to retrieve
 *     responses:
 *       200:
 *         description: Data source with scaled data and population factors.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 datasourceId:
 *                   type: string
 *                   format: uuid
 *                   description: Unique identifier for the data source
 *                 name:
 *                   type: string
 *                   description: Name of the data source
 *                 enabled:
 *                   type: boolean
 *                   description: Whether the data source is enabled
 *                 sectorId:
 *                   type: string
 *                   format: uuid
 *                   description: Associated sector identifier
 *                 data:
 *                   type: object
 *                   description: Processed data from the data source
 *                 populationIssue:
 *                   type: string
 *                   nullable: true
 *                   description: Population scaling issue if any
 *                 countryPopulationScaleFactor:
 *                   type: number
 *                   description: Scaling factor for country population
 *                 regionPopulationScaleFactor:
 *                   type: number
 *                   description: Scaling factor for region population
 *       401:
 *         description: Unauthorized - user lacks edit access to the inventory.
 *       404:
 *         description: Inventory or data source not found.
 */
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
