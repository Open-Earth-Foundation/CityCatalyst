import { db } from "@/models";
import { City } from "@/models/City";
import { DataSourceI18n as DataSource } from "@/models/DataSourceI18n";
import { Inventory } from "@/models/Inventory";
import { logger } from "@/services/logger";
import { groupBy } from "@/util/helpers";
import { getScopesForInventoryAndSector } from "@/util/constants";
import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";
import DataSourceService from "./DataSourceService";
import InventoryProgressService from "./InventoryProgressService";
import { resolveDataSourceLinkUrl } from "@/util/datasource-url";

const DEFAULT_PRIORITY = 0; // 10 is the highest priority

export type DataSourcePreviewItem = {
  datasourceId: string;
  datasourceName: string;
  url?: string;
  sectorName: string;
  subSectorName?: string;
  subCategoryName?: string;
  gpcReferenceNumber: string;
  priority?: number;
};

export type DataSourcePreviewResult = {
  /** GPC reference lines in scope that have at least one applicable catalogue source */
  count: number;
  /** Total GPC reference lines for the inventory type (denominator for coverage) */
  totalGpcCombinations: number;
  /** Rounded 0–100: count / totalGpcCombinations */
  coveragePercent: number;
  sources: DataSourcePreviewItem[];
};

export type ConnectAllDataSourcesError = {
  locode: string;
  error: string;
};

/** Bulk-connect and preview logic for third-party inventory data. */
export default class DataSourceConnectService {
  /**
   * Lists catalogue sources that would be preferred per GPC reference (highest priority),
   * after year and geography filtering. Does not call Global API.
   */
  public static async previewApplicableSources(
    cityId: string,
    year: number,
    inventoryType?: string,
  ): Promise<DataSourcePreviewResult> {
    const city = await db.models.City.findByPk(cityId);
    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }

    const inventory = { year, city } as Inventory;
    const catalogueSources = await DataSourceService.findAllCatalogueSources();
    const { applicableSources } = DataSourceService.filterSources(
      inventory,
      catalogueSources,
    );

    const sourcesByReferenceNumber = groupBy(
      applicableSources.filter(
        (source) =>
          source.subCategory?.referenceNumber ||
          source.subSector?.referenceNumber,
      ),
      (source) =>
        source.subCategory?.referenceNumber ??
        source.subSector?.referenceNumber ??
        "unknown",
    );

    const combinations = inventoryType
      ? await DataSourceConnectService.getAllPossibleGPCCombinations(
          inventoryType,
        )
      : [];

    const allowedRefs = new Set(combinations.map((c) => c.gpcReferenceNumber));

    const coveredGpcCount =
      inventoryType && combinations.length > 0
        ? combinations.filter(
            (c) =>
              (sourcesByReferenceNumber[c.gpcReferenceNumber]?.length ?? 0) > 0,
          ).length
        : Object.keys(sourcesByReferenceNumber).filter(
            (ref) => ref !== "unknown",
          ).length;

    const totalGpcCombinations =
      inventoryType && combinations.length > 0
        ? combinations.length
        : coveredGpcCount;

    const coveragePercent =
      totalGpcCombinations > 0
        ? Math.round((coveredGpcCount / totalGpcCombinations) * 100)
        : 0;

    let previewItems = Object.values(sourcesByReferenceNumber).map((group) => {
      const winner = [...group].sort(
        (a, b) =>
          (b.priority ?? DEFAULT_PRIORITY) - (a.priority ?? DEFAULT_PRIORITY),
      )[0];
      return DataSourceConnectService.toPreviewItem(winner);
    });

    if (inventoryType) {
      previewItems = previewItems.filter((item) =>
        allowedRefs.has(item.gpcReferenceNumber),
      );
    }

    previewItems.sort((a, b) => {
      const sector = a.sectorName.localeCompare(b.sectorName);
      if (sector !== 0) return sector;
      return a.gpcReferenceNumber.localeCompare(b.gpcReferenceNumber);
    });

    return {
      count: coveredGpcCount,
      totalGpcCombinations,
      coveragePercent,
      sources: previewItems,
    };
  }

  /**
   * Connects the best applicable third-party source per GPC line for an inventory
   * (same algorithm as admin bulk connect).
   */
  public static async connectAllForInventory(
    inventoryId: string,
    cityLocode: string,
    userId: string | undefined,
  ): Promise<ConnectAllDataSourcesError[]> {
    const errors: ConnectAllDataSourcesError[] = [];
    logger.info(
      `Connecting data sources for inventory ${inventoryId} (city: ${cityLocode})`,
    );
    const inventory = await db.models.Inventory.findOne({
      where: { inventoryId },
      include: [{ model: City, as: "city" }],
    });
    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }

    const sources = await DataSourceService.findAllSources(inventoryId);
    logger.debug(
      `Found ${sources.length} data sources for inventory ${inventoryId}`,
    );
    const { applicableSources, removedSources } =
      DataSourceService.filterSources(inventory, sources);
    logger.debug(
      `Found ${applicableSources.length} applicable data sources for inventory ${inventoryId}`,
    );
    for (const removedSource of removedSources) {
      logger.debug(
        `Data source ${removedSource.source.datasourceName} was filtered out for inventory ${inventoryId}: ${removedSource.reason}`,
      );
    }

    const sourcesByReferenceNumber = groupBy(
      applicableSources.filter(
        (source) =>
          source.subCategory?.referenceNumber ||
          source.subSector?.referenceNumber,
      ),
      (source) =>
        source.subCategory?.referenceNumber ??
        source.subSector?.referenceNumber ??
        "unknown",
    );

    const populationScaleFactors =
      await DataSourceService.findPopulationScaleFactors(
        inventory,
        applicableSources,
      );

    const allGPCCombinations =
      await DataSourceConnectService.getAllPossibleGPCCombinations(
        inventory.inventoryType!,
      );

    logger.debug(
      `Processing ${allGPCCombinations.length} possible GPC combinations for inventory ${inventoryId}`,
    );

    for (const combination of allGPCCombinations) {
      const { gpcReferenceNumber, sectorId, subSectorId, subCategoryId } =
        combination;

      const sourcesForReference =
        sourcesByReferenceNumber[gpcReferenceNumber] || [];

      if (sourcesForReference.length > 0) {
        const prioritizedSources = sourcesForReference.sort(
          (a, b) =>
            (b.priority ?? DEFAULT_PRIORITY) - (a.priority ?? DEFAULT_PRIORITY),
        );

        let isSuccessful = false;
        for (const source of prioritizedSources) {
          logger.debug(
            `Trying data source ${source.datasourceId} for inventory ${inventoryId}`,
          );

          if (source.retrievalMethod === "global_api_notation_key") {
            const result = await DataSourceService.applySource(
              source,
              inventory,
              populationScaleFactors,
              userId,
              true,
            );
            if (result.success) {
              isSuccessful = true;
              break;
            }
            logger.error(
              `Failed to apply notation key source ${source.datasourceId}: ${result.issue}`,
            );
          } else {
            const data = await DataSourceService.retrieveGlobalAPISource(
              source,
              inventory,
            );
            if (data instanceof String || typeof data === "string") {
              logger.error(
                `Failed to fetch source ${source.datasourceId} for inventory ${inventoryId} for city ${cityLocode}: ${data}`,
              );
              errors.push({
                locode: cityLocode,
                error: `Failed to fetch source - ${source.datasourceId}: ${data}`,
              });
            } else {
              const result = await DataSourceService.applySource(
                source,
                inventory,
                populationScaleFactors,
                userId,
                true,
              );
              if (result.success) {
                isSuccessful = true;
                break;
              }
              logger.error(
                `Failed to apply source ${source.datasourceId}: ${result.issue}`,
              );
            }
          }
        }

        if (!isSuccessful) {
          await DataSourceConnectService.createUnavailableInventoryValue(
            inventoryId,
            gpcReferenceNumber,
            sectorId,
            subSectorId,
            subCategoryId,
            "reason-NE",
          );
        }
      } else {
        await DataSourceConnectService.createUnavailableInventoryValue(
          inventoryId,
          gpcReferenceNumber,
          sectorId,
          subSectorId,
          subCategoryId,
          "reason-NE",
        );
      }
    }

    return errors;
  }

  private static toPreviewItem(source: DataSource): DataSourcePreviewItem {
    const gpcReferenceNumber =
      source.subCategory?.referenceNumber ??
      source.subSector?.referenceNumber ??
      "unknown";
    const subCategoryName = source.subCategory?.subcategoryName;
    const subSectorName =
      source.subCategory?.subsector?.subsectorName ??
      source.subSector?.subsectorName;
    const sectorName =
      source.subCategory?.subsector?.sector?.sectorName ??
      source.subSector?.sector?.sectorName ??
      "Other";

    return {
      datasourceId: source.datasourceId,
      datasourceName: source.datasourceName ?? source.datasourceId,
      url: resolveDataSourceLinkUrl(source),
      sectorName,
      subSectorName,
      subCategoryName,
      gpcReferenceNumber,
      priority: source.priority,
    };
  }

  private static async getAllPossibleGPCCombinations(
    inventoryType: string,
  ): Promise<
    Array<{
      gpcReferenceNumber: string;
      sectorId: string;
      subSectorId: string | null;
      subCategoryId: string | null;
    }>
  > {
    const validSectorRefNos = {
      gpc_basic: ["I", "II", "III"],
      gpc_basic_plus: ["I", "II", "III", "IV", "V"],
    };

    const inventoryStructure =
      await InventoryProgressService.getSortedInventoryStructure();
    const applicableSectors = inventoryStructure.filter((sector) => {
      if (!sector.referenceNumber) {
        return false;
      }
      return (
        validSectorRefNos[
          inventoryType as keyof typeof validSectorRefNos
        ]?.includes(sector.referenceNumber) ?? false
      );
    });

    const combinations: Array<{
      gpcReferenceNumber: string;
      sectorId: string;
      subSectorId: string | null;
      subCategoryId: string | null;
    }> = [];

    for (const sector of applicableSectors) {
      for (const subSector of sector.subSectors) {
        if (subSector.subCategories.length > 0) {
          for (const subCategory of subSector.subCategories) {
            if (inventoryType === "gpc_basic_plus") {
              combinations.push({
                gpcReferenceNumber: subCategory.referenceNumber!,
                sectorId: sector.sectorId,
                subSectorId: subSector.subsectorId,
                subCategoryId: subCategory.subcategoryId,
              });
            } else {
              const scope =
                subCategory.scope?.scopeName &&
                /^\d+$/.test(subCategory.scope.scopeName)
                  ? Number(subCategory.scope.scopeName)
                  : null;

              if (!sector.referenceNumber) {
                continue;
              }

              const allowedScopes = getScopesForInventoryAndSector(
                inventoryType as any,
                sector.referenceNumber,
              );

              if (allowedScopes.length === 0) {
                continue;
              }

              if (scope === null) {
                continue;
              }

              if (allowedScopes.includes(scope)) {
                combinations.push({
                  gpcReferenceNumber: subCategory.referenceNumber!,
                  sectorId: sector.sectorId,
                  subSectorId: subSector.subsectorId,
                  subCategoryId: subCategory.subcategoryId,
                });
              }
            }
          }
        } else {
          if (!sector.referenceNumber) {
            continue;
          }

          const allowedScopes = getScopesForInventoryAndSector(
            inventoryType as any,
            sector.referenceNumber,
          );

          if (
            inventoryType === "gpc_basic_plus" &&
            (sector.referenceNumber === "IV" || sector.referenceNumber === "V")
          ) {
            combinations.push({
              gpcReferenceNumber: subSector.referenceNumber!,
              sectorId: sector.sectorId,
              subSectorId: subSector.subsectorId,
              subCategoryId: null,
            });
          } else if (
            inventoryType === "gpc_basic" &&
            allowedScopes.length > 0
          ) {
            combinations.push({
              gpcReferenceNumber: subSector.referenceNumber!,
              sectorId: sector.sectorId,
              subSectorId: subSector.subsectorId,
              subCategoryId: null,
            });
          }
        }
      }
    }

    return combinations;
  }

  private static async createUnavailableInventoryValue(
    inventoryId: string,
    gpcReferenceNumber: string,
    sectorId: string,
    subSectorId: string | null,
    subCategoryId: string | null,
    reason: string,
  ): Promise<void> {
    try {
      const existingValue = await db.models.InventoryValue.findOne({
        where: {
          inventoryId,
          gpcReferenceNumber,
        },
      });

      if (!existingValue) {
        await db.models.InventoryValue.create({
          id: randomUUID(),
          inventoryId,
          gpcReferenceNumber,
          sectorId,
          subSectorId: subSectorId ?? undefined,
          subCategoryId: subCategoryId ?? undefined,
          unavailableReason: reason,
          unavailableExplanation: "Data not available from data sources",
          co2eq: undefined,
        });
      }
    } catch (error) {
      logger.error(
        `Failed to create unavailable inventory value for ${gpcReferenceNumber}: ${error}`,
      );
    }
  }
}
