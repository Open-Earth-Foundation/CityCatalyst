import { db } from "@/models";
import { Inventory } from "@/models/Inventory";
import { Sector } from "@/models/Sector";
import { SectorValue } from "@/models/SectorValue";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const city = await db.models.City.findOne({ where: { locode: params.city } });
  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  const inventory: Inventory = await db.models.Inventory.findOne({
    where: { cityId: city.cityId, year: params.year },
    include: [
      {
        model: db.models.SectorValue,
        include: [
          db.models.Sector,
          {
            model: db.models.SubSectorValue,
            include: [db.models.SubSector, db.models.DataSource],
          },
          {
            model: db.models.SubCategoryValue,
            include: [db.models.SubCategory, db.models.DataSource],
          },
        ],
      },
    ],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  // TODO cache this
  const sectors: Sector[] = await db.models.Sector.findAll({
    include: [db.models.SubSector, db.models.SubCategory],
  });
  const sectorTotals: Record<string, number> = sectors.reduce(
    (acc, sector) => {
      acc[sector.sectorId] = sector.subSectors.length;
      return acc;
    },
    {} as Record<string, number>,
  );

  const sectorProgress = inventory.sectorValues.map(
    (sectorValue: SectorValue) => {
      const sectorCounts = sectorValue.subSectorValues.reduce(
        (acc, subSectorValue) => {
          if (subSectorValue.source === "user") {
            acc.uploaded++;
          } else {
            acc.thirdParty++;
          }
          return acc;
        },
        { thirdParty: 0, uploaded: 0 },
      );
      return {
        sector: sectorValue.sector,
        total: sectorTotals[sectorValue.sector.sectorId],
        ...sectorCounts,
      };
    },
  );

  const totalProgress = sectorProgress.reduce(
    (acc, sectorInfo) => {
      acc.total += sectorInfo.total;
      acc.thirdParty += sectorInfo.thirdParty;
      acc.uploaded += sectorInfo.uploaded;
      return acc;
    },
    { total: 0, thirdParty: 0, uploaded: 0 },
  );

  return NextResponse.json({ totalProgress, sectorProgress });
});
