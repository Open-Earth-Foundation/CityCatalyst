import type { Sector } from "@/models/Sector";
import { db } from "@/models";
import INVENTORY_STRUCTURE from "../data/inventory-structure.json";
import fs from "fs";
import { Inventory } from "@/models/Inventory";
import type { InventoryValue } from "@/models/InventoryValue";
import * as path from "path";
import * as process from "node:process";
import {
  getScopesForInventoryAndSector,
  getSectorsForInventory,
  SECTORS,
} from "@/util/constants";
import { InventoryTypeEnum } from "@/util/enums";
import { isNotEstimated, isNotOccurring } from "@/util/notation-keys";

// Sectors whose completion is tracked per subcategory; IV and V are per subsector.
const SUBCATEGORY_SECTORS = ["I", "II", "III"];
const GPC_SECTORS = new Set(SECTORS.map((sector) => sector.referenceNumber));

function isRequiredScope(
  scopeName: string | null | undefined,
  allowedScopes: number[],
): boolean {
  return !!scopeName && allowedScopes.includes(parseInt(scopeName));
}

// Lower wins when several stored rows map to the same required GPC unit.
function valuePriority(inventoryValue: InventoryValue): number {
  if (inventoryValue.dataSource) return 0;
  if (
    isNotEstimated(inventoryValue.unavailableReason) ||
    isNotOccurring(inventoryValue.unavailableReason)
  ) {
    return 2;
  }
  return 1;
}

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
        return getSectorsForInventory(inventory.inventoryType)
          .map((s) => s.referenceNumber)
          .includes(sector.referenceNumber!);
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
              scopeName: subcategory.scope.scopeName,
              reportinglevelId: subcategory.reportinglevelId,
              created: new Date(0),
              lastUpdated: new Date(0),
            }))
            .filter((subCategory) => {
              if (
                inventory.inventoryType === InventoryTypeEnum.GPC_BASIC_PLUS
              ) {
                return true;
              }

              const scope =
                subCategory.scopeName && /^\d+$/.test(subCategory.scopeName)
                  ? Number(subCategory.scopeName)
                  : null;
              if (
                scope === null ||
                !inventory.inventoryType ||
                !sector.referenceNumber
              ) {
                // sectors IV and V don't have an associated scope and should only be returned for GPC_BASIC_PLUS
                return false;
              }

              return getScopesForInventoryAndSector(
                inventory.inventoryType,
                sector.referenceNumber,
              )!.includes(scope);
            }),
        })),
      }));

    const sectorProgress = filteredOutSectors.map((sector) => {
      // Completion counts each required GPC unit once: subcategories for
      // sectors I-III, subsectors for IV-V. Stored rows outside the inventory
      // type (e.g. imported Scope 3 rows in a GPC BASIC inventory) are ignored
      // so they cannot push completion above 100%.
      const countsSubCategories = SUBCATEGORY_SECTORS.includes(
        sector.referenceNumber!,
      );
      const allowedScopes = getScopesForInventoryAndSector(
        inventory.inventoryType as InventoryTypeEnum,
        sector.referenceNumber!,
      );
      const requiredUnitsBySubSector = new Map<string, string[]>(
        sector.subSectors.map((subSector) => [
          subSector.subsectorId,
          countsSubCategories
            ? subSector.subCategories
                .filter((subCategory) =>
                  isRequiredScope(subCategory.scopeName, allowedScopes),
                )
                .map((subCategory) => subCategory.subcategoryId)
            : [subSector.subsectorId],
        ]),
      );
      const subCategoryIdsByReference = new Map<string, string>(
        sector.subSectors.flatMap((subSector) =>
          subSector.subCategories
            .filter((subCategory) => !!subCategory.referenceNumber)
            .map(
              (subCategory) =>
                [subCategory.referenceNumber!, subCategory.subcategoryId] as [
                  string,
                  string,
                ],
            ),
        ),
      );
      const requiredUnits = new Set(
        [...requiredUnitsBySubSector.values()].flat(),
      );

      const valuesByUnit = new Map<string, InventoryValue>();
      for (const inventoryValue of inventory.inventoryValues) {
        if (inventoryValue.sectorId !== sector.sectorId) {
          continue;
        }
        const unitId = countsSubCategories
          ? (inventoryValue.subCategoryId ??
            subCategoryIdsByReference.get(
              inventoryValue.gpcReferenceNumber ?? "",
            ))
          : inventoryValue.subSectorId;
        if (!unitId || !requiredUnits.has(unitId)) {
          continue;
        }
        const current = valuesByUnit.get(unitId);
        if (
          !current ||
          valuePriority(inventoryValue) < valuePriority(current)
        ) {
          valuesByUnit.set(unitId, inventoryValue);
        }
      }

      const sectorCounts = {
        thirdParty: 0,
        uploaded: 0,
        reasonNE: 0,
        reasonNO: 0,
      };
      for (const inventoryValue of valuesByUnit.values()) {
        if (inventoryValue.dataSource) {
          sectorCounts.thirdParty++;
        } else if (isNotEstimated(inventoryValue.unavailableReason)) {
          sectorCounts.reasonNE++;
        } else if (isNotOccurring(inventoryValue.unavailableReason)) {
          sectorCounts.reasonNO++;
        } else {
          sectorCounts.uploaded++;
        }
      }

      // add completed field to subsectors if there is a value for it
      const subSectors = sector.subSectors.map((subSector) => {
        const subSectorUnits =
          requiredUnitsBySubSector.get(subSector.subsectorId) ?? [];
        const totalCount = subSectorUnits.length;
        const completedCount = subSectorUnits.filter((unitId) =>
          valuesByUnit.has(unitId),
        ).length;

        return {
          completed: completedCount === totalCount,
          completedCount,
          totalCount,
          sectorId: subSector.sectorId, // optional string defaults to empty string
          referenceNumber: subSector.referenceNumber, // optional string defaults to empty string
          scopeId: subSector.scopeId,
          subsectorId: subSector.subsectorId,
          subsectorName: subSector.subsectorName,
          subCategories: subSector.subCategories,
        };
      });

      return {
        sector: sector,
        total: requiredUnits.size,
        subSectors,
        ...sectorCounts,
      };
    });

    const totalProgress = sectorProgress.reduce(
      (acc, sectorInfo) => {
        acc.total += sectorInfo.total;
        acc.thirdParty += sectorInfo.thirdParty;
        acc.uploaded += sectorInfo.uploaded;
        acc.reasonNE += sectorInfo.reasonNE;
        acc.reasonNO += sectorInfo.reasonNO;
        return acc;
      },
      { total: 0, thirdParty: 0, uploaded: 0, reasonNE: 0, reasonNO: 0 },
    );

    return {
      inventory,
      totalProgress,
      sectorProgress,
    };
  }

  /**
   * Returns the distinct GPC reference numbers that exist in the GPC taxonomy
   * but are not required for the inventory type, e.g. Scope 3 or IPPU rows in
   * a GPC BASIC inventory. Unknown references are left to import validation.
   */
  public static async findReferencesOutsideInventoryType(
    inventoryType: InventoryTypeEnum | undefined,
    gpcReferenceNumbers: string[],
  ): Promise<string[]> {
    if (!inventoryType) {
      return [];
    }
    const sectors = await this.getSortedInventoryStructure();
    const knownReferences = new Set<string>();
    const requiredReferences = new Set<string>();
    for (const sector of sectors) {
      if (!GPC_SECTORS.has(sector.referenceNumber!)) {
        continue;
      }
      const countsSubCategories = SUBCATEGORY_SECTORS.includes(
        sector.referenceNumber!,
      );
      const allowedScopes = getScopesForInventoryAndSector(
        inventoryType,
        sector.referenceNumber!,
      );
      for (const subSector of sector.subSectors) {
        // Sectors IV-V are required per subsector, so any of their references
        // follows the sector's inventory type.
        const subSectorRequired = allowedScopes.length > 0;
        if (!countsSubCategories && subSector.referenceNumber) {
          knownReferences.add(subSector.referenceNumber);
          if (subSectorRequired)
            requiredReferences.add(subSector.referenceNumber);
        }
        for (const subCategory of subSector.subCategories) {
          if (!subCategory.referenceNumber) continue;
          knownReferences.add(subCategory.referenceNumber);
          const required = countsSubCategories
            ? isRequiredScope(subCategory.scope?.scopeName, allowedScopes)
            : subSectorRequired;
          if (required) requiredReferences.add(subCategory.referenceNumber);
        }
      }
    }

    const references = new Set(
      gpcReferenceNumbers.map((reference) => reference.trim()),
    );
    return [...references].filter(
      (reference) =>
        knownReferences.has(reference) && !requiredReferences.has(reference),
    );
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

  public static async getSortedInventoryStructure() {
    if (
      Inventory_Sector_Hierarchy.length > 0 &&
      process.env.NODE_ENV !== "test"
    ) {
      return Inventory_Sector_Hierarchy;
    }
    let sectors: Sector[] = await db.models.Sector.findAll({
      attributes: { exclude: ["created", "last_updated"] },
      include: [
        {
          model: db.models.SubSector,
          as: "subSectors",
          attributes: { exclude: ["created", "last_updated"] },
          include: [
            {
              model: db.models.SubCategory,
              as: "subCategories",
              attributes: { exclude: ["created", "last_updated"] },
              include: [
                {
                  model: db.models.Scope,
                  attributes: { exclude: ["created", "last_updated"] },
                  as: "scope",
                },
              ],
            },
          ],
        },
      ],
    });

    sectors = sectors.sort(this.romanNumeralComparison);
    for (const sector of sectors) {
      sector.sectorName = this.toTranslationString(sector.sectorName);
      sector.subSectors = sector.subSectors
        .sort((a, b) => {
          const ra = Number((a.referenceNumber ?? "X.9").split(".")[1]);
          const rb = Number((b.referenceNumber ?? "X.9").split(".")[1]);
          return ra - rb;
        })
        .map((subSector) => {
          // transform name to translation string
          subSector.subsectorName = this.toTranslationString(
            subSector.subsectorName,
          );
          return subSector;
        });
      for (const subSector of sector.subSectors) {
        subSector.subCategories = subSector.subCategories
          .sort((a, b) => {
            const ra = Number((a.referenceNumber ?? "X.9.9").split(".")[2]);
            const rb = Number((b.referenceNumber ?? "X.9.9").split(".")[2]);
            return ra - rb;
          })
          .map((subCategory) => {
            subCategory.subcategoryName = this.toTranslationString(
              subCategory.subcategoryName,
            );
            return subCategory;
          });
      }
    }

    if (process.env.NODE_ENV !== "test") {
      this.writeHierarchyToCache(sectors);
    }
    return sectors;
  }

  private static toTranslationString(str?: string): string {
    return (str ?? "")
      .toLowerCase()
      .replaceAll(" ", "-")
      .replaceAll(/[^a-zA-Z\d-]/g, "");
  }
}
