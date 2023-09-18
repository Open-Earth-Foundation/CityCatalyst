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
            include: [
              { model: db.models.SubSector, as: "subsector" },
              {
                model: db.models.DataSource,
                attributes: ["datasourceId", "sourceType"],
                as: "dataSource",
              },
            ],
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
    include: [{ model: db.models.SubSector, as: "subSectors" }],
  });
  const sectorTotals: Record<string, number> = sectors.reduce(
    (acc, sector) => {
      acc[sector.sectorId] = sector.subSectors.length;
      return acc;
    },
    {} as Record<string, number>,
  );

  // count SubSectorValues grouped by source type and sector
  const sectorProgress = inventory.sectorValues.map(
    (sectorValue: SectorValue) => {
      const sectorCounts = sectorValue.subSectorValues.reduce(
        (acc, subSectorValue) => {
          if (!subSectorValue.dataSource) {
            return acc;
          }

          if (subSectorValue.dataSource.sourceType === "user") {
            acc.uploaded++;
          } else if (subSectorValue.dataSource.sourceType === "third_party") {
            acc.thirdParty++;
          } else {
            console.error(
              "Invalid value for SubSectorValue.dataSource.sourceType of subsector",
              subSectorValue.subsector.subsectorName,
              "in its data source",
              subSectorValue.dataSource.datasourceId + ":",
              subSectorValue.dataSource.sourceType,
            );
          }
          return acc;
        },
        { thirdParty: 0, uploaded: 0 },
      );
      const sector = sectors.find(
        (sector) => sector.sectorId === sectorValue.sectorId,
      );
      if (!sector) {
        throw new createHttpError.InternalServerError(
          `Sector ${sectorValue.sectorId} not found!`,
        );
      }
      // add completed field to subsectors if there is a value for it
      const subSectors = sector.subSectors.map((subSector) => {
        const completed =
          sectorValue.subSectorValues.find(
            (subSectorValue) =>
              subSectorValue.subsectorId === subSector.subsectorId,
          ) != null;
        return { completed, ...subSector };
      });
      return {
        sector: sectorValue.sector,
        total: sectorTotals[sectorValue.sector.sectorId],
        subSectors,
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

  return NextResponse.json({ data: { totalProgress, sectorProgress } });
});
