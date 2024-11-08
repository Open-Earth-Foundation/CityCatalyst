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
