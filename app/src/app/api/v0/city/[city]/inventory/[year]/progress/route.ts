import { db } from "@/models";
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

  const inventory = await db.models.Inventory.findOne({
    where: { cityId: city.cityId, year: params.year },
    include: [
      {
        model: db.models.SectorValue,
        as: "sectorValues",
        include: [
          {
            model: db.models.Sector,
            as: "sector",
          },
          {
            model: db.models.SubSectorValue,
            as: "subSectorValues",
            include: [{ model: db.models.SubSector, as: "subsector" }],
          },
          // {
          //   model: db.models.SubCategoryValue,
          //   as: "subCategoryValues",
          //   include: [{ model: db.models.SubCategory, as: "subcategory" }],
          // },
        ],
      },
    ],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  // TODO cache this
  const sectors: Sector[] = await db.models.Sector.findAll({
    include: [{ model: db.models.SubSector, as: "subSectors" }],
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
          if (subSectorValue.entryMethod === "user") {
            acc.uploaded++;
          } else if (subSectorValue.entryMethod === "third_party") {
            acc.thirdParty++;
          } else {
            console.error(
              "Invalid value for SubSectorValue.entryMethod of subsector",
              subSectorValue.subsector.subsectorName + ":",
              subSectorValue.entryMethod,
            );
          }
          return acc;
        },
        { thirdParty: 0, uploaded: 0 },
      );
      return {
        sector: sectorValue.sector,
        total: sectorTotals[sectorValue.sector.sectorId],
        subSectors: sectorValue.subSectorValues.map((value) => value.subsector),
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
