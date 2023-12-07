import DataSourceService from "@/backend/DataSourceService";
import { filterSources } from "@/lib/filter-sources";
import { db } from "@/models";
import { City } from "@/models/City";
import { DataSource } from "@/models/DataSource";
import { Scope } from "@/models/Scope";
import { SubCategory } from "@/models/SubCategory";
import { SubCategoryValue } from "@/models/SubCategoryValue";
import { SubSector } from "@/models/SubSector";
import { SubSectorValue } from "@/models/SubSectorValue";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { Op } from "sequelize";
import { z } from "zod";

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
          model: SubSectorValue,
          as: "subSectorValues",
          required: false,
          where: { inventoryId: params.inventoryId },
        },
        {
          model: SubCategoryValue,
          as: "subCategoryValues",
          required: false,
          where: { inventoryId: params.inventoryId },
        },
        { model: SubSector, as: "subSector" },
        { model: SubCategory, as: "subCategory" },
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
  const applicableSources = filterSources(inventory, sources);

  // TODO add query parameter to make this optional?
  const sourceData = await Promise.all(
    applicableSources.map(async (source) => {
      const data = await DataSourceService.retrieveGlobalAPISource(
        source,
        inventory,
      );
      return { source, data };
    }),
  );

  return NextResponse.json({ data: sourceData });
});

const applySourcesRequest = z.object({
  dataSourceIds: z.array(z.string().uuid()),
});

export const POST = apiHandler(async (req: NextRequest, { params }) => {
  const body = await applySourcesRequest.parse(await req.json());
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
  const applicableSources = filterSources(inventory, sources);
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
      const result = { id: source.datasourceId, success: true };

      if (source.retrievalMethod === "global_api") {
        result.success = await DataSourceService.applyGlobalAPISource(
          source,
          inventory,
        );
      } else {
        console.error(
          `Unsupported retrieval method ${source.retrievalMethod} for data source ${source.datasourceId}`,
        );
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

  return NextResponse.json({
    data: { successful, failed, invalid: invalidSourceIds },
  });
});
