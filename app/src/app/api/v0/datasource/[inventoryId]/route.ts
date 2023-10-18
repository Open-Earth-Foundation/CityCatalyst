import { filterSources } from "@/lib/filter-sources";
import { db } from "@/models";
import { City } from "@/models/City";
import { DataSource } from "@/models/DataSource";
import { Inventory } from "@/models/Inventory";
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

  const sectors = await db.models.Sector.findAll({
    include: [
      {
        model: DataSource,
        as: "dataSources",
        where: {
          startYear: { [Op.lte]: inventory.year },
          endYear: { [Op.gte]: inventory.year },
        },
      },
    ],
  });
  const sources = sectors.flatMap((sector) => sector.dataSources);
  const applicableSources = filterSources(inventory, sources);
  return NextResponse.json({ data: applicableSources });
});

const applySourcesRequest = z.array(z.string().uuid());

export const POST = apiHandler(async (req: NextRequest, { params }) => {
  const sourceIds = await applySourcesRequest.parse(await req.json());
  const inventory = await db.models.Inventory.findOne({
    where: { inventoryId: params.inventoryId },
    include: [{ model: City, as: "city" }],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const sources = await db.models.DataSource.findAll({
    where: { datasourceId: sourceIds },
  });
  if (!sources) {
    throw new createHttpError.NotFound("Sources not found");
  }
  const applicableSources = filterSources(inventory, sources);
  const applicableSourceIds = applicableSources.map(source => source.datasourceId);
  const invalidSources = sources.filter((source) => !applicableSourceIds.includes(source.datasourceId));
  const invalidSourceIds = invalidSources.map(source => source.datasourceId);

  // TODO check if the user has made manual edits that would be overwritten
  // TODO create new versioning record

  // download source data and apply in database
  const sourceResults = await Promise.all(applicableSources.map(async (source) => {
    const result = { id: source.datasourceId, success: true };
    
    if (source.retrievalMethod === "global_api") {
      result.success = await retrieveGlobalAPISource(source, inventory);
    } else {
      console.error(`Unsupported retrieval method ${source.retrievalMethod} for data source ${source.datasourceId}`);
      result.success = false;
    }

    return result;
  }));

  const successful = sourceResults.filter(result => result.success).map(result => result.id);
  const failed = sourceResults
    .filter((result) => !result.success)
    .map((result) => result.id);

  return NextResponse.json({ data: { successful, failed, invalid: invalidSourceIds } });
});

async function retrieveGlobalAPISource(source: DataSource, inventory: Inventory): Promise<boolean> {
  if (
    !source.apiEndpoint ||
    !inventory.city.locode ||
    inventory.year == null ||
    !(source.subsectorId || source.subcategoryId) ||
    !source.subSector.referenceNumber
  ) {
    return false;
  }

  const url = source.apiEndpoint
    .replace(":locode", inventory.city.locode)
    .replace(":year", inventory.year.toString())
    .replace(":gpcReferenceNumber", source.subSector.referenceNumber);

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

  if (data.points.length === 0) {
    return false;
  }

  const emissions = data.total.emissions;
  const values = {
    datasourceId: source.datasourceId,
    totalEmissions:
      emissions.co2_co2eq +
      emissions.ch4_co2eq +
      emissions.n2o_co2eq, // TODO store separately? ActivityValue?
    inventoryId: inventory.inventoryId,
  };

  if (source.subsectorId) {
    const subSector = await db.models.SubSectorValue.create({
      subsectorValueId: randomUUID(),
      subsectorId: source.subsectorId,
      ...values,
    });
  } else if (source.subcategoryId) {
    const subCategory = await db.models.SubCategoryValue.create({
      subcategoryValueId: randomUUID(),
      subcategoryId: source.subcategoryId,
      ...values,
    });
    // TODO add parent SubSectorValue if not present yet?
  } else {
    return false;
  }

  return true;
}
