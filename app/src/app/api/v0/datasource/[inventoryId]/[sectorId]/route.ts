/**
 * @swagger
 * /api/v0/datasource/{inventoryId}/{sectorId}:
 *   get:
 *     tags:
 *       - Data Sources
 *     summary: List applicable data sources and data for a specific sector.
 *     description: Retrieves the sector with its data sources, filters them by applicability to the inventory, and fetches data. No explicit authentication is enforced in this handler. Returns { data: successfulSources[], removedSources, failedSources }.
 *     parameters:
 *       - in: path
 *         name: inventoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: sectorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Applicable sources and fetch results.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { type: object, additionalProperties: true }
 *                 removedSources:
 *                   type: array
 *                   items: { type: object, additionalProperties: true }
 *                 failedSources:
 *                   type: array
 *                   items: { type: object, additionalProperties: true }
 *       404:
 *         description: Inventory or sector not found.
 */
import DataSourceService from "@/backend/DataSourceService";
import { db } from "@/models";
import { City } from "@/models/City";
import { DataSourceI18n as DataSource } from "@/models/DataSourceI18n";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const inventory = await db.models.Inventory.findOne({
    where: { inventoryId: params.inventoryId },
    include: [{ model: City, as: "city" }],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const sector = await db.models.Sector.findOne({
    where: { sectorId: params.sectorId },
    include: [
      {
        model: DataSource,
        as: "dataSources",
        include: [
          { model: db.models.Scope, as: "scopes" },
          { model: db.models.Publisher, as: "publisher" },
          {
            model: db.models.SubCategory,
            as: "subCategory",
            include: [
              {
                model: db.models.SubSector,
                as: "subsector",
              },
            ],
          },
          { model: db.models.SubSector, as: "subSector" },
        ],
      },
    ],
  });
  if (!sector) {
    throw new createHttpError.NotFound("Sector not found");
  }

  const { applicableSources, removedSources } = DataSourceService.filterSources(
    inventory,
    sector.dataSources,
  );

  // TODO add query parameter to make this optional?
  const sourceData = await Promise.all(
    applicableSources.map(async (source) => {
      const data = await DataSourceService.retrieveGlobalAPISource(
        source,
        inventory,
      );
      if (data instanceof String || typeof data === "string") {
        return { error: data as string, source };
      }
      return { source, data };
    }),
  );

  const successfulSources = sourceData.filter((source) => !source.error);
  const failedSources = sourceData.filter((source) => !!source.error);

  return NextResponse.json({
    data: successfulSources,
    removedSources,
    failedSources,
  });
});
