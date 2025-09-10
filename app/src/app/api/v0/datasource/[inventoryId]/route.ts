/**
 * @swagger
 * /api/v0/datasource/{inventoryId}:
 *   get:
 *     tags:
 *       - Data Sources
 *     summary: List applicable data sources with data for an inventory
 *     parameters:
 *       - in: path
 *         name: inventoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Applicable sources with data, plus removed and failed sources.
 *       404:
 *         description: Inventory not found.
 *   post:
 *     tags:
 *       - Data Sources
 *     summary: Apply selected data sources to an inventory
 *     parameters:
 *       - in: path
 *         name: inventoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dataSourceIds]
 *             properties:
 *               dataSourceIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Apply results with successful, failed, invalid, issues, and removedSources.
 *       404:
 *         description: Inventory or sources not found.
 */
import DataSourceService from "@/backend/DataSourceService";
import { db } from "@/models";
import { City } from "@/models/City";
import { DataSourceI18n as DataSource } from "@/models/DataSourceI18n";
import { Scope } from "@/models/Scope";
import { SubCategory } from "@/models/SubCategory";
import { InventoryValue } from "@/models/InventoryValue";
import { SubSector } from "@/models/SubSector";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const inventory = await db.models.Inventory.findOne({
    where: { inventoryId: params.inventoryId },
    include: [{ model: City, as: "city" }],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const sources = await DataSourceService.findAllSources(params.inventoryId);
  const { applicableSources, removedSources } = DataSourceService.filterSources(
    inventory,
    sources,
  );

  // determine scaling factor for downscaled sources
  const {
    countryPopulationScaleFactor,
    regionPopulationScaleFactor,
    populationIssue,
  } = await DataSourceService.findPopulationScaleFactors(
    inventory,
    applicableSources,
  );

  // TODO add query parameter to make this optional?
  const sourceData = await Promise.all(
    applicableSources.map((source) =>
      DataSourceService.getSourceWithData(
        source,
        inventory,
        countryPopulationScaleFactor,
        regionPopulationScaleFactor,
        populationIssue,
      ),
    ),
  );

  const successfulSources = sourceData.filter((source) => !source.error);
  const failedSources = sourceData.filter((source) => !!source.error);

  return NextResponse.json({
    data: successfulSources,
    removedSources,
    failedSources,
  });
});

const applySourcesRequest = z.object({
  dataSourceIds: z.array(z.string().uuid()),
});

export const POST = apiHandler(async (req: NextRequest, { params }) => {
  const body = applySourcesRequest.parse(await req.json());
  const inventory = await db.models.Inventory.findOne({
    where: { inventoryId: params.inventoryId },
    include: [{ model: City, as: "city" }],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const sources = await db.models.DataSource.findAll({
    where: { datasourceId: body.dataSourceIds },
    include: [
      { model: SubSector, required: false, as: "subSector" },
      {
        model: SubCategory,
        required: false,
        as: "subCategory",
        include: [
          {
            model: SubSector,
            required: false,
            as: "subsector",
          },
        ],
      },
    ],
  });
  if (!sources) {
    throw new createHttpError.NotFound("Sources not found");
  }
  const { applicableSources, removedSources } = DataSourceService.filterSources(
    inventory,
    sources,
  );
  const applicableSourceIds = applicableSources.map(
    (source) => source.datasourceId,
  );
  const invalidSources = sources.filter(
    (source) => !applicableSourceIds.includes(source.datasourceId),
  );
  const invalidSourceIds = invalidSources.map((source) => source.datasourceId);

  // TODO check if the user has made manual edits that would be overwritten
  // TODO create new versioning record

  const populationScaleFactors =
    await DataSourceService.findPopulationScaleFactors(
      inventory,
      applicableSources,
    );

  // download source data and apply in database
  const sourceResults = await Promise.all(
    applicableSources.map(async (source) => {
      const result = await DataSourceService.applySource(
        source,
        inventory,
        populationScaleFactors,
      );
      return result;
    }),
  );

  const successful = sourceResults
    .filter((result) => result.success)
    .map((result) => result.id);
  const failed = sourceResults
    .filter((result) => !result.success)
    .map((result) => result.id);
  const issues = sourceResults
    .filter((result) => !!result.issue)
    .reduce((acc: Record<string, string>, result) => {
      acc[result.id] = result.issue!;
      return acc;
    }, {});

  return NextResponse.json({
    data: {
      successful,
      failed,
      invalid: invalidSourceIds,
      issues,
      removedSources,
    },
  });
});
