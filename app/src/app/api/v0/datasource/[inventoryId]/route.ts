import { filterSources } from "@/lib/filter-sources";
import { db } from "@/models";
import { City } from "@/models/City";
import { DataSource } from "@/models/DataSource";
import { Inventory } from "@/models/Inventory";
import { Scope } from "@/models/Scope";
import { SubCategory } from "@/models/SubCategory";
import { SubCategoryValue } from "@/models/SubCategoryValue";
import { SubSector } from "@/models/SubSector";
import {
  SubSectorValue,
  SubSectorValueCreationAttributes,
} from "@/models/SubSectorValue";
import { apiHandler } from "@/util/api";
import { randomUUID } from "crypto";
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
  return NextResponse.json({ data: applicableSources });
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
      { model: SubCategory, required: false, as: "subCategory", include: [{
        model: SubSector, required: false, as: "subsector",
      }]},
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
        result.success = await retrieveGlobalAPISource(source, inventory);
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

async function initSubSectorValue(
  source: DataSource,
  inventory: Inventory,
  totalEmissions: number,
  values: Partial<SubSectorValueCreationAttributes>,
  sectorId: string,
  subsectorId: string,
): Promise<SubSectorValue> {
  if (!sectorId) {
    throw new createHttpError.InternalServerError(
      "Failed to find sector ID for source " + source.datasourceId,
    );
  }
  if (!subsectorId) {
    throw new createHttpError.InternalServerError(
      "Failed to find subsector ID for source " + source.datasourceId,
    );
  }

  let sectorValue = await db.models.SectorValue.findOne({
    where: {
      sectorId,
      inventoryId: inventory.inventoryId,
    },
  });
  // TODO have to init/ update totalEmissions here?
  if (!sectorValue) {
    sectorValue = await db.models.SectorValue.create({
      sectorValueId: randomUUID(),
      sectorId,
      inventoryId: inventory.inventoryId,
      totalEmissions,
    });
  } else {
    await sectorValue.update({
      totalEmissions: (sectorValue.totalEmissions || 0) + totalEmissions,
    });
  }
  const subSectorValue = await db.models.SubSectorValue.create({
    ...values,
    sectorValueId: sectorValue.sectorValueId,
    subsectorId,
    subsectorValueId: randomUUID(),
  });
  return subSectorValue;
}

async function retrieveGlobalAPISource(
  source: DataSource,
  inventory: Inventory,
): Promise<boolean> {
  const referenceNumber =
    source.subCategory?.referenceNumber || source.subSector?.referenceNumber;

  if (
    !source.apiEndpoint ||
    !inventory.city.locode ||
    inventory.year == null ||
    !(source.subsectorId || source.subcategoryId) ||
    !referenceNumber
  ) {
    return false;
  }

  const url = source.apiEndpoint
    .replace(":locode", inventory.city.locode.replace("-", " "))
    .replace(":year", inventory.year.toString())
    .replace(":gpcReferenceNumber", referenceNumber);

  let data;
  try {
    const response = await fetch(url);
    data = await response.json();
  } catch (err) {
    console.error(
      `Failed to query data source ${source.datasourceId} at URL ${url}:`,
      err,
    );
    return false;
  }

  if (typeof data.totals !== "object") {
    console.error("Incorrect response from Global API for URL:", url, data);
    return false;
  }

  const emissions = data.totals.emissions;
  // TODO store values for co2, ch4, n2o separately for accounting and editing
  const totalEmissions = emissions.co2eq_100yr;
  const values = {
    datasourceId: source.datasourceId,
    totalEmissions,
    inventoryId: inventory.inventoryId,
  };

  if (source.subsectorId) {
    await initSubSectorValue(
      source,
      inventory,
      totalEmissions,
      values,
      source.subSector.sectorId!,
      source.subsectorId,
    );
  } else if (source.subcategoryId) {
    // add parent SubSectorValue if not present yet
    let subSectorValue = await db.models.SubSectorValue.findOne({
      where: {
        subsectorId: source.subCategory?.subsectorId,
        inventoryId: inventory.inventoryId,
      },
    });
    if (!subSectorValue) {
      subSectorValue = await initSubSectorValue(
        source,
        inventory,
        totalEmissions,
        values,
        source.subCategory?.subsector?.sectorId!,
        source.subCategory?.subsectorId!,
      );
    } else {
      await subSectorValue.update({
        totalEmissions: (subSectorValue.totalEmissions || 0) + totalEmissions,
      });
    }
    const subCategoryValue = await db.models.SubCategoryValue.create({
      ...values,
      subcategoryValueId: randomUUID(),
      subcategoryId: source.subcategoryId,
      subsectorValueId: subSectorValue.subsectorValueId,
    });
  } else {
    return false;
  }

  return true;
}
