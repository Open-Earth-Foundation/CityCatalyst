/**
 * @swagger
 * /api/v1/datasource/{inventoryId}:
 *   get:
 *     tags:
 *       - Data Sources
 *     summary: List applicable data sources and fetched data for an inventory.
 *     description: Finds candidate sources for the inventory, filters by applicability, and fetches data (including population scaling). No explicit authentication is enforced here in code; adjust middleware if needed. Returns { data: successfulSources[], removedSources, failedSources }.
 *     parameters:
 *       - in: path
 *         name: inventoryId
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
 *                     description: Data source with fetched data or error information
 *                 removedSources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       datasourceId:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       subSector:
 *                         type: object
 *                         properties:
 *                           subsectorId:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                       subCategory:
 *                         type: object
 *                         properties:
 *                           subcategoryId:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                     description: Data sources removed due to applicability filtering
 *                 failedSources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       datasourceId:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       error:
 *                         type: string
 *                         description: Error message describing why the source failed
 *                     description: Data sources that failed to fetch data
 *       404:
 *         description: Inventory not found.
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

/**
 * @swagger
 * /api/v1/datasource/{inventoryId}:
 *   post:
 *     tags:
 *       - Data Sources
 *     summary: Apply selected data sources to an inventory and persist values.
 *     description: Downloads and applies the specified data sources to the inventory (creating/updating inventory values). No explicit authentication is enforced in this handler in code. Returns '{' data: { successful[], failed[], invalid[], issues{}, removedSources[] } '}'.
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
 *         description: Apply results summary.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     successful:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: uuid
 *                         description: Successfully applied datasource IDs
 *                     failed:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: uuid
 *                         description: Failed datasource IDs
 *                     invalid:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: uuid
 *                         description: Invalid datasource IDs not applicable to inventory
 *                     issues:
 *                       type: object
 *                       additionalProperties:
 *                         type: string
 *                       description: Map of datasource IDs to error messages
 *                     removedSources:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           datasourceId:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                           subSector:
 *                             type: object
 *                             properties:
 *                               subsectorId:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                           subCategory:
 *                             type: object
 *                             properties:
 *                               subcategoryId:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                       description: Data sources removed due to applicability filtering
 *       404:
 *         description: Inventory or sources not found.
 *     examples:
 *       application/json:
 *         dataSourceIds:
 *           - "550e8400-e29b-41d4-a716-446655440000"
 *           - "550e8400-e29b-41d4-a716-446655440001"
 */
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
