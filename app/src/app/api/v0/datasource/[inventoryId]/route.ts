import { filterSources } from "@/lib/filter-sources";
import { db } from "@/models";
import { City } from "@/models/City";
import { DataSource } from "@/models/DataSource";
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
  const failed = invalidSources.map(source => source.datasourceId);

  // TODO check if the user has made manual edits that would be overwritten
  const successful = applicableSourceIds;

  // TODO apply sources
  // TODO create new versioning record

  return NextResponse.json({ data: { successful, failed } });
});