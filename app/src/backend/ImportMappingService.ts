import InventoryProgressService from "@/backend/InventoryProgressService";
import FileParserService from "@/backend/FileParserService";
import ECRFImportService from "@/backend/ECRFImportService";
import type { Inventory } from "@/models";
import { getScopesForInventoryAndSector } from "@/util/constants";
import type { ParsedFileData } from "@/backend/FileParserService";

export interface ECRFRowMapping {
  gpcRefNo: string;
  sectorName?: string;
  subsectorName?: string;
  subcategoryName?: string;
  scopeName?: string;
  totalCO2e?: number;
  co2?: number;
  ch4?: number;
  n2o?: number;
  notationKey?: string;
  hasErrors: boolean;
  hasWarnings: boolean;
  errors?: string[];
  warnings?: string[];
  sectorId?: string;
  subsectorId?: string;
  subcategoryId?: string | null;
  scopeId?: string;
  activityType?: string;
  activityAmount?: number;
  activityUnit?: string;
  methodology?: string;
  dataSource?: string;
}

export interface GPCRequiredRow {
  gpcReferenceNumber: string;
  sectorId: string;
  sectorName: string;
  subsectorId: string | null;
  subsectorName: string | null;
  subcategoryId: string | null;
  subcategoryName: string | null;
  scopeId: string | null;
  scopeName: string | null;
}

export interface RowMappingComparison {
  // eCRF row data (if exists)
  ecrfRow: ECRFRowMapping | null;
  // Required GPC row data
  gpcRequiredRow: GPCRequiredRow;
  // Mapping status
  status: "mapped" | "unmapped" | "missing_from_ecrf" | "error";
  // Additional info
  mappingIssues?: string[];
}

export interface MappingPreview {
  // All eCRF rows from the file
  ecrfRows: ECRFRowMapping[];
  // All required GPC rows for this inventory
  gpcRequiredRows: GPCRequiredRow[];
  // Side-by-side comparison
  comparisons: RowMappingComparison[];
  // Summary statistics
  summary: {
    totalECRFRows: number;
    totalGPCRequiredRows: number;
    mappedRows: number;
    unmappedRows: number;
    missingFromECRF: number;
    rowsWithErrors: number;
  };
}

/**
 * Import Mapping Service
 * Provides functionality to compare eCRF rows with required GPC rows
 */
export default class ImportMappingService {
  /**
   * Get all required GPC combinations for an inventory
   */
  public static async getRequiredGPCRows(
    inventory: Inventory,
  ): Promise<GPCRequiredRow[]> {
    const inventoryType = inventory.inventoryType || "gpc_basic";
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
      return validSectorRefNos[
        inventoryType as keyof typeof validSectorRefNos
      ]?.includes(sector.referenceNumber);
    });

    const requiredRows: GPCRequiredRow[] = [];

    for (const sector of applicableSectors) {
      for (const subSector of sector.subSectors) {
        if (subSector.subCategories.length > 0) {
          // Process subcategories when they exist
          for (const subCategory of subSector.subCategories) {
            // Apply the same scope filtering logic as InventoryProgressService
            if (inventoryType === "gpc_basic_plus") {
              // All subcategories are valid for GPC_BASIC_PLUS
              requiredRows.push({
                gpcReferenceNumber: subCategory.referenceNumber!,
                sectorId: sector.sectorId,
                sectorName: sector.sectorName,
                subsectorId: subSector.subsectorId,
                subsectorName: subSector.subsectorName,
                subcategoryId: subCategory.subcategoryId,
                subcategoryName: subCategory.subcategoryName,
                scopeId: subCategory.scopeId || null,
                scopeName: subCategory.scope?.scopeName || null,
              });
            } else {
              // For GPC_BASIC, filter by scope
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

              // If allowedScopes is empty (like for sectors IV and V in GPC_BASIC), skip all subcategories
              if (allowedScopes.length === 0) {
                continue;
              }

              // If scope is null but allowedScopes has values, skip this subcategory
              if (scope === null) {
                continue;
              }

              if (allowedScopes.includes(scope)) {
                requiredRows.push({
                  gpcReferenceNumber: subCategory.referenceNumber!,
                  sectorId: sector.sectorId,
                  sectorName: sector.sectorName,
                  subsectorId: subSector.subsectorId,
                  subsectorName: subSector.subsectorName,
                  subcategoryId: subCategory.subcategoryId,
                  subcategoryName: subCategory.subcategoryName,
                  scopeId: subCategory.scopeId || null,
                  scopeName: subCategory.scope?.scopeName || null,
                });
              }
            }
          }
        } else {
          // Process subsector directly when no subcategories exist (like IV.1, V.1, etc.)
          if (!sector.referenceNumber) {
            continue;
          }

          const allowedScopes = getScopesForInventoryAndSector(
            inventoryType as any,
            sector.referenceNumber,
          );

          // For sectors IV and V, check if they're allowed for this inventory type
          if (
            inventoryType === "gpc_basic_plus" &&
            (sector.referenceNumber === "IV" ||
              sector.referenceNumber === "V")
          ) {
            // Include subsector for GPC_BASIC_PLUS
            requiredRows.push({
              gpcReferenceNumber: subSector.referenceNumber!,
              sectorId: sector.sectorId,
              sectorName: sector.sectorName,
              subsectorId: subSector.subsectorId,
              subsectorName: subSector.subsectorName,
              subcategoryId: null,
              subcategoryName: null,
              scopeId: null,
              scopeName: null,
            });
          } else if (
            inventoryType === "gpc_basic" &&
            allowedScopes.length > 0
          ) {
            // For GPC_BASIC, only include if the sector has allowed scopes
            requiredRows.push({
              gpcReferenceNumber: subSector.referenceNumber!,
              sectorId: sector.sectorId,
              sectorName: sector.sectorName,
              subsectorId: subSector.subsectorId,
              subsectorName: subSector.subsectorName,
              subcategoryId: null,
              subcategoryName: null,
              scopeId: null,
              scopeName: null,
            });
          }
        }
      }
    }

    return requiredRows;
  }

  /**
   * Convert eCRF import result rows to mapping format
   */
  private static convertECRFRowsToMappings(
    importResultRows: Array<{
      gpcRefNo: string;
      sectorId: string;
      subsectorId: string;
      subcategoryId: string | null;
      scopeId: string;
      co2?: number;
      ch4?: number;
      n2o?: number;
      totalCO2e?: number;
      notationKey?: string;
      errors?: string[];
      warnings?: string[];
      activityType?: string;
      activityAmount?: number;
      activityUnit?: string;
      methodology?: string;
      activityDataSource?: string;
    }>,
  ): ECRFRowMapping[] {
    return importResultRows.map((row) => ({
      gpcRefNo: row.gpcRefNo,
      sectorId: row.sectorId,
      subsectorId: row.subsectorId,
      subcategoryId: row.subcategoryId,
      scopeId: row.scopeId,
      totalCO2e: row.totalCO2e,
      co2: row.co2,
      ch4: row.ch4,
      n2o: row.n2o,
      notationKey: row.notationKey,
      hasErrors: !!(row.errors && row.errors.length > 0),
      hasWarnings: !!(row.warnings && row.warnings.length > 0),
      errors: row.errors,
      warnings: row.warnings,
      activityType: row.activityType,
      activityAmount: row.activityAmount,
      activityUnit: row.activityUnit,
      methodology: row.methodology,
      dataSource: row.activityDataSource,
    }));
  }

  /**
   * Create a side-by-side comparison of eCRF rows and required GPC rows
   */
  public static async createMappingPreview(
    inventory: Inventory,
    parsedData: ParsedFileData,
    detectedColumns: Record<string, number>,
  ): Promise<MappingPreview> {
    // Get required GPC rows
    const gpcRequiredRows = await this.getRequiredGPCRows(inventory);

    // Process eCRF file to get rows
    const importResult = await ECRFImportService.processECRFFile(
      parsedData,
      detectedColumns,
    );

    // Convert eCRF rows to mapping format
    const ecrfRows = this.convertECRFRowsToMappings(importResult.rows);

    // Create a map of eCRF rows by GPC reference number
    const ecrfRowMap = new Map<string, ECRFRowMapping>();
    for (const ecrfRow of ecrfRows) {
      ecrfRowMap.set(ecrfRow.gpcRefNo, ecrfRow);
    }

    // Create a map of GPC required rows by reference number
    const gpcRowMap = new Map<string, GPCRequiredRow>();
    for (const gpcRow of gpcRequiredRows) {
      gpcRowMap.set(gpcRow.gpcReferenceNumber, gpcRow);
    }

    // Build comparisons
    const comparisons: RowMappingComparison[] = [];

    // First, process all GPC required rows
    for (const gpcRow of gpcRequiredRows) {
      const ecrfRow = ecrfRowMap.get(gpcRow.gpcReferenceNumber);
      const mappingIssues: string[] = [];

      let status: RowMappingComparison["status"] = "mapped";

      if (!ecrfRow) {
        status = "missing_from_ecrf";
      } else {
        // Check for mapping issues
        if (ecrfRow.hasErrors) {
          status = "error";
          mappingIssues.push(...(ecrfRow.errors || []));
        }

        if (ecrfRow.hasWarnings) {
          mappingIssues.push(...(ecrfRow.warnings || []));
        }

        // Check if IDs match (verify correct mapping)
        if (ecrfRow.sectorId !== gpcRow.sectorId) {
          mappingIssues.push(
            `Sector ID mismatch: expected ${gpcRow.sectorId}, got ${ecrfRow.sectorId}`,
          );
        }

        if (ecrfRow.subsectorId !== gpcRow.subsectorId) {
          mappingIssues.push(
            `Subsector ID mismatch: expected ${gpcRow.subsectorId}, got ${ecrfRow.subsectorId}`,
          );
        }

        if (ecrfRow.subcategoryId !== gpcRow.subcategoryId) {
          mappingIssues.push(
            `Subcategory ID mismatch: expected ${gpcRow.subcategoryId}, got ${ecrfRow.subcategoryId}`,
          );
        }

        if (status !== "error" && mappingIssues.length > 0) {
          status = "unmapped";
        }
      }

      comparisons.push({
        ecrfRow: ecrfRow || null,
        gpcRequiredRow: gpcRow,
        status,
        mappingIssues: mappingIssues.length > 0 ? mappingIssues : undefined,
      });
    }

    // Also include eCRF rows that don't match any required GPC row
    for (const ecrfRow of ecrfRows) {
      if (!gpcRowMap.has(ecrfRow.gpcRefNo)) {
        // This eCRF row doesn't match any required GPC row
        comparisons.push({
          ecrfRow,
          gpcRequiredRow: {
            gpcReferenceNumber: ecrfRow.gpcRefNo,
            sectorId: ecrfRow.sectorId || "",
            sectorName: "",
            subsectorId: ecrfRow.subsectorId || null,
            subsectorName: null,
            subcategoryId: ecrfRow.subcategoryId || null,
            subcategoryName: null,
            scopeId: ecrfRow.scopeId || null,
            scopeName: null,
          },
          status: "unmapped",
          mappingIssues: [
            "This GPC reference number is not required for this inventory type",
          ],
        });
      }
    }

    // Calculate summary statistics
    const summary = {
      totalECRFRows: ecrfRows.length,
      totalGPCRequiredRows: gpcRequiredRows.length,
      mappedRows: comparisons.filter((c) => c.status === "mapped").length,
      unmappedRows: comparisons.filter((c) => c.status === "unmapped").length,
      missingFromECRF: comparisons.filter(
        (c) => c.status === "missing_from_ecrf",
      ).length,
      rowsWithErrors: comparisons.filter((c) => c.status === "error").length,
    };

    return {
      ecrfRows,
      gpcRequiredRows,
      comparisons,
      summary,
    };
  }
}
