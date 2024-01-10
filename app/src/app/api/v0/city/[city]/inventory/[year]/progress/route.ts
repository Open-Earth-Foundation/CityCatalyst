import { db } from "@/models";
import { Sector } from "@/models/Sector";
import { logger } from "@/services/logger";
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
              model: db.models.SubCategory,
              as: "subCategory",
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
          include: [{ model: db.models.SubCategory, as: "subCategories" }],
        },
      ],
    });
    const sectorTotals: Record<string, number> = sectors.reduce(
      (acc, sector) => {
        const subCategoryCount = sector.subSectors
          .map((s) => s.subCategories.length)
          .reduce((acc, count) => acc + count, 0);
        acc[sector.sectorId] = subCategoryCount;
        return acc;
      },
      {} as Record<string, number>,
    );

    // count SubSectorValues grouped by source type and sector
    const sectorProgress = sectors.map((sector: Sector) => {
      const inventoryValues = inventory.inventoryValues.filter(
        (inventoryVal) => sector.sectorId === inventoryVal.sectorId,
      );
      let sectorCounts = { thirdParty: 0, uploaded: 0 };
      if (inventoryValues) {
        sectorCounts = inventoryValues.reduce(
          (acc, inventoryValue) => {
            if (!inventoryValue.dataSource) {
              logger.warn(
                "Missing data source for inventory value",
                inventoryValue.id,
              );
              return acc;
            }

            const sourceType = inventoryValue.dataSource.sourceType;
            if (sourceType === "user") {
              acc.uploaded++;
            } else if (sourceType === "third_party") {
              acc.thirdParty++;
            } else {
              console.error(
                "Invalid value for InventoryValue.dataSource.sourceType of inventory value",
                inventoryValue.id,
                "in its data source",
                inventoryValue.dataSource.datasourceId + ":",
                inventoryValue.dataSource.sourceType,
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
        let totalCount = subSector.subCategories.length;
        let completedCount = 0;
        if (inventoryValues?.length > 0) {
          completedCount = inventoryValues.filter(
            (inventoryValue) =>
              inventoryValue.subSectorId === subSector.subsectorId,
          ).length;
          completed = completedCount === totalCount;
        }
        return {
          completed,
          completedCount,
          totalCount,
          ...subSector.dataValues,
        };
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
