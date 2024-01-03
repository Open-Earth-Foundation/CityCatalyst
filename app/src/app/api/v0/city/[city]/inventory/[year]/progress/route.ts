import { db } from "@/models";
import { Sector } from "@/models/Sector";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(
  async (
    _req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const { params, session } = context;
    const city = await db.models.City.findOne({
      where: { locode: params.city },
    });
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }

    const inventory = await db.models.Inventory.findOne({
      where: { cityId: city.cityId, year: params.year },
      include: [
        {
          model: db.models.InventoryValue,
          as: "inventoryValues",
          include: [
            {
              model: db.models.Sector,
              as: "sector",
            },
            {
              model: db.models.SubSector,
              as: "subSector",
            },
            {
              model: db.models.DataSource,
              attributes: ["datasourceId", "sourceType"],
              as: "dataSource",
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
      include: [
        {
          model: db.models.SubSector,
          as: "subSectors",
          include: [
            { model: db.models.SubCategory, as: "subCategories" },
            { model: db.models.Scope, as: "scope" },
          ],
        },
      ],
    });
    const sectorTotals: Record<string, number> = sectors.reduce(
      (acc, sector) => {
        acc[sector.sectorId] = sector.subSectors.length;
        return acc;
      },
      {} as Record<string, number>,
    );

    // count SubSectorValues grouped by source type and sector
    const sectorProgress = sectors.map((sector: Sector) => {
      const sectorValue = inventory.inventoryValues.find(
        (inventoryVal) => sector.sectorId === inventoryVal.sectorId,
      );
      let sectorCounts = { thirdParty: 0, uploaded: 0 };
      if (sectorValue) {
        sectorCounts = sectorValue.subSectorValues.reduce(
          (acc, subSectorValue) => {
            if (!subSectorValue.dataSource) {
              return acc;
            }

            const sourceType = subSectorValue.dataSource.sourceType;
            if (sourceType === "user") {
              acc.uploaded++;
            } else if (sourceType === "third_party") {
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
      }

      // add completed field to subsectors if there is a value for it
      const subSectors = sector.subSectors.map((subSector) => {
        let completed = false;
        if (sectorValue) {
          completed =
            sectorValue.subSectorValues.find(
              (subSectorValue) =>
                subSectorValue.subsectorId === subSector.subsectorId,
            ) != null;
        }
        return { completed, ...subSector.dataValues };
      });

      return {
        sector: sector,
        total: sectorTotals[sector.sectorId],
        subSectors,
        ...sectorCounts,
      };
    });

    const totalProgress = sectorProgress.reduce(
      (acc, sectorInfo) => {
        acc.total += sectorInfo.total;
        acc.thirdParty += sectorInfo.thirdParty;
        acc.uploaded += sectorInfo.uploaded;
        return acc;
      },
      { total: 0, thirdParty: 0, uploaded: 0 },
    );

    return NextResponse.json({
      data: {
        inventoryId: inventory.inventoryId,
        totalProgress,
        sectorProgress,
      },
    });
  },
);
