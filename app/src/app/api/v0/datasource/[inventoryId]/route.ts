import DataSourceService from "@/backend/DataSourceService";
import { db } from "@/models";
import { City } from "@/models/City";
import { DataSource } from "@/models/DataSource";
import { Scope } from "@/models/Scope";
import { SubCategory } from "@/models/SubCategory";
import { InventoryValue } from "@/models/InventoryValue";
import { SubSector } from "@/models/SubSector";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { Op } from "sequelize";
import { z } from "zod";
import { logger } from "@/services/logger";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const inventory = await db.models.Inventory.findOne({
    where: { inventoryId: params.inventoryId },
    include: [{ model: City, as: "city" }],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const include = [
    {
      model: DataSource,
      as: "dataSources",
      where: {
        startYear: { [Op.lte]: inventory.year },
        endYear: { [Op.gte]: inventory.year },
      },
      include: [
        { model: Scope, as: "scopes" },
        {
          model: InventoryValue,
          as: "inventoryValues",
          required: false,
          where: { inventoryId: params.inventoryId },
        },
        { model: SubSector, as: "subSector" },
        {
          model: SubCategory,
          as: "subCategory",
          include: [
            {
              model: SubSector,
              as: "subsector",
            },
          ],
        },
      ],
    },
  ];

  const sectors = await db.models.Sector.findAll({ include });
  const subSectors = await db.models.SubSector.findAll({ include });
  const subCategories = await db.models.SubCategory.findAll({ include });

  const sectorSources = sectors.flatMap((sector) => sector.dataSources);
  const subSectorSources = subSectors.flatMap(
    (subSector) => subSector.dataSources,
  );
  const subCategorySources = subCategories.flatMap(
    (subCategory) => subCategory.dataSources,
  );

  const sources = sectorSources
    .concat(subSectorSources)
    .concat(subCategorySources);
  const applicableSources = DataSourceService.filterSources(inventory, sources);

  // TODO add query parameter to make this optional?
  const sourceData = (
    await Promise.all(
      applicableSources.map(async (source) => {
        const data = await DataSourceService.retrieveGlobalAPISource(
          source,
          inventory,
        );
        if (data instanceof String || typeof data === "string") {
          return null;
        }
        return { source, data };
      }),
    )
  ).filter((source) => !!source);

  return NextResponse.json({ data: sourceData });
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
  const applicableSources = DataSourceService.filterSources(inventory, sources);
  const applicableSourceIds = applicableSources.map(
    (source) => source.datasourceId,
  );
  const invalidSources = sources.filter(
    (source) => !applicableSourceIds.includes(source.datasourceId),
  );
  const invalidSourceIds = invalidSources.map((source) => source.datasourceId);

  // TODO check if the user has made manual edits that would be overwritten
  // TODO create new versioning record

  // download source data and apply in database
  const sourceResults = await Promise.all(
    applicableSources.map(async (source) => {
      const result: { id: string; success: boolean; issue?: string } = {
        id: source.datasourceId,
        success: true,
        issue: undefined,
      };

      if (source.retrievalMethod === "global_api") {
        const sourceStatus = await DataSourceService.applyGlobalAPISource(
          source,
          inventory,
        );
        if (typeof sourceStatus === "string") {
          result.issue = sourceStatus;
          result.success = false;
        }
      } else if (
        source.retrievalMethod === "global_api_downscaled_by_population"
      ) {
        const population = await db.models.Population.findOne({
          where: {
            cityId: inventory.cityId,
            year: inventory.year,
          },
        });
        if (!population?.population || !population?.countryPopulation) {
          result.issue =
            "City is missing population/ country population for the inventory year";
          result.success = false;
          return result;
        }
        const scaleFactor =
          population.population / population.countryPopulation;
        const sourceStatus = await DataSourceService.applyGlobalAPISource(
          source,
          inventory,
          scaleFactor,
        );
        if (typeof sourceStatus === "string") {
          result.issue = sourceStatus;
          result.success = false;
        }
      } else {
        result.issue = `Unsupported retrieval method ${source.retrievalMethod} for data source ${source.datasourceId}`;
        logger.error(result.issue);
        result.success = false;
      }

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
    data: { successful, failed, invalid: invalidSourceIds, issues },
  });
});
