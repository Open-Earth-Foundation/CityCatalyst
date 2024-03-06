import DataSourceService from "@/backend/DataSourceService";
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
        include: [
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

  const applicableSources = DataSourceService.filterSources(
    inventory,
    sector.dataSources,
  );

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
