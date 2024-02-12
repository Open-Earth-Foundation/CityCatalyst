import { db } from "@/models";
import { Sector } from "@/models/Sector";
import { User } from "@/models/User";
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
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");

    const inventory = await db.models.Inventory.findOne({
      where: { inventoryId: params.inventory },
      include: [
        {
          model: db.models.City,
          as: "city",
          include: [{ model: db.models.User, as: "users" }],
        },
        {
          model: db.models.InventoryValue,
          as: "inventoryValues",
          include: [
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
    const canUserAccess = inventory.city.users.some(
      (user: User) => user.userId === session.user.id,
    );
    if (!canUserAccess) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }

    // TODO cache this (including sorting)
    let sectors: Sector[] = await db.models.Sector.findAll({
      include: [
        {
          model: db.models.SubSector,
          as: "subSectors",
          include: [
            {
              model: db.models.SubCategory,
              as: "subCategories",
            },
          ],
        },
      ],
    });

    // sort whole inventory by GPC reference number
    function romanNumeralComparison(sectorA: Sector, sectorB: Sector) {
      const a = sectorA.referenceNumber || "";
      const b = sectorB.referenceNumber || "";

      const romanTable: Record<string, number> = {
        I: 1,
        II: 2,
        III: 3,
        IV: 4,
        V: 5,
        VI: 6,
        VII: 7,
        "": 1337,
      };

      return romanTable[a] - romanTable[b];
    }
    sectors = sectors.sort(romanNumeralComparison);
    for (const sector of sectors) {
      sector.subSectors = sector.subSectors.sort((a, b) => {
        const ra = Number((a.referenceNumber ?? "X.9").split(".")[1]);
        const rb = Number((b.referenceNumber ?? "X.9").split(".")[1]);
        return ra - rb;
      });
      for (const subSector of sector.subSectors) {
        subSector.subCategories = subSector.subCategories.sort((a, b) => {
          const ra = Number((a.referenceNumber ?? "X.9.9").split(".")[2]);
          const rb = Number((b.referenceNumber ?? "X.9.9").split(".")[2]);
          return ra - rb;
        });
      }
    }

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
        (inventoryValue) => sector.sectorId === inventoryValue.sectorId,
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
