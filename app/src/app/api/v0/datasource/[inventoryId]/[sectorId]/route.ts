import { filterSources } from "@/lib/filter-sources";
import { db } from "@/models";
import { City } from "@/models/City";
import { DataSource } from "@/models/DataSource";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { Op } from "sequelize";

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
        where: {
          startYear: { [Op.lte]: inventory.year },
          endYear: { [Op.gte]: inventory.year },
        },
      },
    ],
  });
  if (!sector) {
    throw new createHttpError.NotFound("Sector not found");
  }

  const applicableSources = filterSources(inventory, sector.dataSources);
  return NextResponse.json({ data: applicableSources });
});