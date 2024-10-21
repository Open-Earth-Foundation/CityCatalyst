import type { Sector } from "@/models/Sector";
import { db } from "@/models";
import INVENTORY_STRUCTURE from "../data/inventory-structure.json";
import fs from "fs";
import { logger } from "@/services/logger";
import { Inventory } from "@/models/Inventory";
import * as path from "path";
import * as process from "node:process";

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
// Construct the absolute path to your JSON file
const filePath = path.join(
  process.cwd(),
  "src",
  "data",
  "inventory-structure.json",
);

export const Inventory_Sector_Hierarchy =
  INVENTORY_STRUCTURE as unknown as Sector[];

export default class InventoryProgressService {
  public static async getInventoryProgress(inventory: Inventory) {
    const sectors = await this.getSortedInventoryStructure();

    const filteredOutSectors = sectors
      .filter((sector) => {
        if (sector.referenceNumber && romanTable[sector.referenceNumber] < 4) {
          return true;
        }
      })
      .map((sector) => ({
        id: sector.sectorId,
        sectorId: sector.sectorId,
        referenceNumber: sector.referenceNumber,
        sectorName: sector.sectorName,
        subSectors: sector.subSectors.map((subsector) => ({
          sectorId: subsector.sectorId, // optional string defaults to empty string
          referenceNumber: subsector.referenceNumber, // optional string defaults to empty string
          scopeId: subsector.scopeId,
          subsectorId: subsector.subsectorId,
          subsectorName: subsector.subsectorName,
          subCategories: subsector.subCategories
            .map((subcategory) => ({
              subcategoryId: subcategory.subcategoryId,
              subcategoryName: subcategory.subcategoryName,
              activityName: subcategory.activityName,
              referenceNumber: subcategory.referenceNumber,
              subsectorId: subcategory.subsectorId,
              scopeId: subcategory.scopeId,
              reportinglevelId: subcategory.reportinglevelId,
              created: new Date(0),
              lastUpdated: new Date(0),
            }))
            .filter((subCategory) => {
              const lastDigit = parseInt(
                subCategory.referenceNumber?.split(".")[2] as string,
              );
              if (
                sector.referenceNumber === "I" ||
                sector.referenceNumber === "II"
              ) {
                return lastDigit < 3;
                // return subcategories with reference numbers that end in 1 and 2
              } else if (sector.referenceNumber === "III") {
                return [1, 3].includes(lastDigit);
                // return subcategories ending with 1 and 3
              }
            }),
        })),
      }));

    const sectorTotals: Record<string, number> = filteredOutSectors.reduce(
      (acc, sector) => {
        const subCategoryCount = sector.subSectors
          .map((s) => s.subCategories.length)
          .reduce((acc, count) => acc + count, 0);
        acc[sector.sectorId] = subCategoryCount;
        return acc;
      },
      {} as Record<string, number>,
    );

    const sectorProgress = filteredOutSectors.map((sector) => {
      const inventoryValues = inventory.inventoryValues.filter(
        (inventoryValue) => sector.sectorId === inventoryValue.sectorId,
      );

      let sectorCounts = { thirdParty: 0, uploaded: 0 };
      if (inventoryValues) {
        sectorCounts = inventoryValues.reduce(
          (acc, inventoryValue) => {
            const sourceType = inventoryValue.dataSource?.sourceType;

            if (sourceType === "third_party") {
              acc.thirdParty++;
            } else {
              acc.uploaded++;
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
          ...{
            sectorId: subSector.sectorId, // optional string defaults to empty string
            referenceNumber: subSector.referenceNumber, // optional string defaults to empty string
            scopeId: subSector.scopeId,
            subsectorId: subSector.subsectorId,
            subsectorName: subSector.subsectorName,
            subCategories: subSector.subCategories,
          },
          // ...subSector,
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

    return {
      inventory,
      totalProgress,
      sectorProgress,
    };
  }

  private static romanNumeralComparison(sectorA: Sector, sectorB: Sector) {
    const a = sectorA.referenceNumber || "";
    const b = sectorB.referenceNumber || "";

    return romanTable[a] - romanTable[b];
  }

  private static writeHierarchyToCache(sortedSectorData: Sector[]) {
    fs.writeFileSync(
      filePath,
      JSON.stringify(sortedSectorData, null, 2),
      "utf-8",
    );
  }

  private static async getSortedInventoryStructure() {
    if (
      Inventory_Sector_Hierarchy.length > 0 &&
      process.env.NODE_ENV !== "test"
    ) {
      return Inventory_Sector_Hierarchy;
    }
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

    sectors = sectors.sort(this.romanNumeralComparison);
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

    if (process.env.NODE_ENV !== "test") {
      this.writeHierarchyToCache(sectors);
    }
    return sectors;
  }
}