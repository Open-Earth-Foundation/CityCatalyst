import { db } from "@/models";
import ECRFImportService, { type ECRFImportResult } from "./ECRFImportService";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { decimalToBigInt } from "@/util/big_int";
import { logger } from "@/services/logger";
import {
  MANUAL_INPUT_HIERARCHY,
  type Methodology,
  type DirectMeasure,
  type ExtraField,
} from "@/util/form-schema";
import fs from "fs";
import path from "path";
import process from "node:process";

/**
 * Maps eCRF notation keys to unavailableReason enum values
 * eCRF uses: NO, NE, C, IE
 * Database uses: no-occurrance, not-estimated, confidential-information, included-elsewhere
 */
const notationKeyMapping: Record<string, string> = {
  NO: "no-occurrance",
  NE: "not-estimated",
  C: "confidential-information",
  IE: "included-elsewhere",
};

/**
 * Load translation file and create reverse map (value -> key)
 * This is used to map unit values like "Tonnes (T)" to keys like "units-tonnes"
 * and activity type values like "Firewood" to keys like "fuel-type-firewood"
 */
let translationMap: Record<string, string> | null = null;

function loadTranslationMap(): Record<string, string> {
  if (translationMap) {
    return translationMap;
  }

  try {
    const translationPath = path.join(
      process.cwd(),
      "src",
      "i18n",
      "locales",
      "en",
      "manage-subsectors.json",
    );
    const translations = JSON.parse(
      fs.readFileSync(translationPath, "utf-8"),
    ) as Record<string, string>;

    // Create reverse map for all translations (value -> key)
    translationMap = {};
    for (const [key, value] of Object.entries(translations)) {
      // Normalize both key and value for matching
      const normalizedValue = value.toLowerCase().trim();
      translationMap[normalizedValue] = key;
      // Also add the original value for exact matches
      translationMap[value] = key;
    }

    return translationMap;
  } catch (error) {
    logger.error({ err: error }, "Failed to load translation map");
    return {};
  }
}

/**
 * Maps unit value from eCRF file to translation key
 * @param unitValue - Raw unit value from eCRF (e.g., "Tonnes (T)", "Liters (l)")
 * @returns Translation key (e.g., "units-tonnes", "units-liters") or original value if not found
 */
function mapUnitToTranslationKey(unitValue: string): string {
  if (!unitValue) {
    return unitValue;
  }

  const translations = loadTranslationMap();
  const normalized = unitValue.toLowerCase().trim();

  // Try exact match first
  if (translations[unitValue]) {
    return translations[unitValue];
  }

  // Try normalized match
  if (translations[normalized]) {
    return translations[normalized];
  }

  // If already a translation key, return as-is
  if (unitValue.startsWith("units-")) {
    return unitValue;
  }

  // Return original value if no mapping found
  return unitValue;
}

/**
 * Maps activity type value from eCRF file to schema key
 * @param activityTypeValue - Raw activity type value from eCRF (e.g., "Firewood", "Natural Gas")
 * @param methodology - Methodology object from schema
 * @param gpcRefNo - GPC reference number
 * @returns Schema key (e.g., "fuel-type-firewood", "fuel-type-natural-gas") or original value if not found
 */
function mapActivityTypeToSchemaKey(
  activityTypeValue: string,
  methodology: Methodology | DirectMeasure | undefined,
  gpcRefNo: string,
): string {
  if (!activityTypeValue || !methodology) {
    return activityTypeValue;
  }

  // Get the activityTypeField from methodology
  const activityTypeField = methodology.activityTypeField;
  if (!activityTypeField) {
    return activityTypeValue;
  }

  // Find the field definition in the schema
  const hierarchyEntry = MANUAL_INPUT_HIERARCHY[gpcRefNo];
  if (!hierarchyEntry) {
    return activityTypeValue;
  }

  // Look in methodology activities for the field definition
  let fieldOptions: string[] | undefined;

  if (
    "activities" in methodology &&
    methodology.activities?.[0]?.["extra-fields"]
  ) {
    const fieldDef = methodology.activities[0]["extra-fields"].find(
      (f: ExtraField) => f.id === activityTypeField && Array.isArray(f.options),
    );
    fieldOptions = fieldDef?.options as string[] | undefined;
  }

  // If not found in activities, check directMeasure extra-fields
  if (!fieldOptions && hierarchyEntry.directMeasure?.["extra-fields"]) {
    const fieldDef = hierarchyEntry.directMeasure["extra-fields"].find(
      (f: ExtraField) => f.id === activityTypeField && Array.isArray(f.options),
    );
    fieldOptions = fieldDef?.options as string[] | undefined;
  }

  // Use cached translation map to map values to keys
  if (!fieldOptions || fieldOptions.length === 0) {
    return activityTypeValue;
  }

  try {
    const translations = loadTranslationMap();
    const normalizedValue = activityTypeValue.toLowerCase().trim();

    // First, try direct reverse lookup (value -> key)
    const directMatch =
      translations[activityTypeValue] || translations[normalizedValue];
    if (directMatch && fieldOptions.includes(directMatch)) {
      return directMatch;
    }

    // Try to find a matching option key by checking translations
    for (const optionKey of fieldOptions) {
      const translatedValue = translations[optionKey];
      if (translatedValue) {
        const normalizedTranslated = translatedValue.toLowerCase().trim();
        // Check if the eCRF value matches the translated value
        if (
          normalizedTranslated === normalizedValue ||
          translatedValue === activityTypeValue
        ) {
          return optionKey;
        }
      }
      // Also check if the option key itself matches (already a key)
      if (optionKey.toLowerCase() === normalizedValue) {
        return optionKey;
      }
    }
  } catch (error) {
    logger.error(
      { err: error },
      "Failed to load translations for activity type mapping",
    );
  }

  // Return original value if no mapping found
  return activityTypeValue;
}

/**
 * Maps methodology name from eCRF file to methodology ID from schema
 * @param methodologyName - Methodology name from eCRF (e.g., "Fuel Consumption", "Energy Consumption")
 * @param gpcRefNo - GPC reference number (e.g., "I.1.1")
 * @returns Methodology ID from schema or undefined if not found
 */
function mapMethodologyToSchema(
  methodologyName: string | undefined,
  gpcRefNo: string,
): string | undefined {
  if (!methodologyName) {
    return undefined;
  }

  const hierarchyEntry = MANUAL_INPUT_HIERARCHY[gpcRefNo];
  if (!hierarchyEntry?.methodologies) {
    return undefined;
  }

  // Normalize methodology name for matching
  const normalizedName = methodologyName.toLowerCase().trim();

  // Try to find matching methodology
  // Match based on keywords in methodology ID or common patterns
  for (const methodology of hierarchyEntry.methodologies) {
    if (methodology.disabled) {
      continue;
    }

    const methodologyId = methodology.id.toLowerCase();

    // Check for common patterns
    // "Fuel Consumption" -> "fuel-combustion-*-methodology" or "fuel-*-methodology"
    if (
      normalizedName.includes("fuel") &&
      (methodologyId.includes("fuel-combustion") ||
        methodologyId.includes("fuel-sales"))
    ) {
      return methodology.id;
    }

    // "Energy Consumption" -> "energy-consumption-*-methodology"
    if (
      normalizedName.includes("energy") &&
      methodologyId.includes("energy-consumption")
    ) {
      return methodology.id;
    }

    // "Direct Measure" -> directMeasure methodology
    if (
      normalizedName.includes("direct") &&
      normalizedName.includes("measure")
    ) {
      // Return directMeasure if available
      return hierarchyEntry.directMeasure?.id;
    }

    // Try exact match on methodology ID (without -methodology suffix)
    const idWithoutSuffix = methodologyId.replace(/-methodology$/, "");
    const nameWords = normalizedName.split(/\s+/);
    const allWordsMatch = nameWords.every((word) =>
      idWithoutSuffix.includes(word),
    );

    if (allWordsMatch && nameWords.length > 0) {
      return methodology.id;
    }
  }

  return undefined;
}

export interface ImportSummary {
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errors: string[];
  warnings: string[];
}

/**
 * Inventory Import Service
 * Populates inventory with imported eCRF data
 */
export default class InventoryImportService {
  /**
   * Import eCRF data into inventory
   * @param inventoryId - Inventory ID to import into
   * @param importResult - Processed eCRF import result
   * @returns ImportSummary with import statistics
   */
  public static async importECRFData(
    inventoryId: string,
    importResult: ECRFImportResult,
  ): Promise<ImportSummary> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let importedRows = 0;
    let skippedRows = 0;

    // Set inventory year from file when missing (year column mapped as "Year")
    const inventory = await db.models.Inventory.findByPk(inventoryId);
    if (
      inventory &&
      inventory.year == null &&
      importResult.inferredYearFromFile != null
    ) {
      await inventory.update({ year: importResult.inferredYearFromFile });
      logger.info(
        {
          inventoryId,
          year: importResult.inferredYearFromFile,
        },
        "Set inventory year from imported file",
      );
    }

    // Filter to only valid rows (no errors)
    const validRows = importResult.rows.filter(
      (row) => !row.errors || row.errors.length === 0,
    );

    if (validRows.length === 0) {
      errors.push("No valid rows to import");
      return {
        totalRows: importResult.rowCount,
        importedRows: 0,
        skippedRows: importResult.rowCount,
        errors,
        warnings,
      };
    }

    // Process each valid row
    for (const row of validRows) {
      try {
        // Check if inventory value already exists for this GPC reference
        const existingValue = await db.models.InventoryValue.findOne({
          where: {
            inventoryId,
            gpcReferenceNumber: row.gpcRefNo,
          },
        });

        // Calculate total CO2e first (use totalCO2e if available, otherwise sum individual gases)
        let totalCO2e: number | undefined = row.totalCO2e;

        console.log(
          `[Import] GPC ${row.gpcRefNo} - Initial totalCO2e: ${totalCO2e}, CO2: ${row.co2}, CH4: ${row.ch4}, N2O: ${row.n2o}, NotationKey: ${row.notationKey}`,
        );

        if (!totalCO2e) {
          // Sum individual gas values (already in CO2e from eCRF)
          const co2 = row.co2 || 0;
          const ch4 = row.ch4 || 0;
          const n2o = row.n2o || 0;
          totalCO2e = co2 + ch4 + n2o;
          console.log(
            `[Import] GPC ${row.gpcRefNo} - Calculated totalCO2e from individual gases: ${totalCO2e}`,
          );
        }

        // Priority: Emission values take precedence over notation keys
        // Only use notation keys if there are NO emission values
        if (totalCO2e && totalCO2e > 0) {
          console.log(
            `[Import] GPC ${row.gpcRefNo} - Storing emissions: totalCO2e=${totalCO2e} tonnes -> ${new Decimal(totalCO2e).mul(1000)} kg`,
          );
          // Handle rows with emission values (ignore notation keys if emissions exist)
          // Convert metric tonnes to the unit used in database (kilograms)
          // eCRF files use metric tonnes, database stores as bigint (kilograms)
          // 1 metric tonne = 1000 kilograms
          const co2eqKilograms = new Decimal(totalCO2e).mul(1000);
          const co2eqBigInt = decimalToBigInt(co2eqKilograms);

          // Map methodology from eCRF to schema methodology ID
          const mappedMethodology = mapMethodologyToSchema(
            row.methodology,
            row.gpcRefNo,
          );

          // Get hierarchy entry for field mapping
          const hierarchyEntry = MANUAL_INPUT_HIERARCHY[row.gpcRefNo];

          // Use mapped methodology, or fall back to directMeasure if methodology is "Direct Measure" or not found
          const finalMethodology =
            mappedMethodology ||
            (row.methodology?.toLowerCase().includes("direct") &&
            row.methodology?.toLowerCase().includes("measure")
              ? hierarchyEntry?.directMeasure?.id
              : hierarchyEntry?.directMeasure?.id) ||
            row.methodology;

          let inventoryValue;
          if (existingValue) {
            // Update existing value with emissions (clear notation keys if present)
            inventoryValue = await existingValue.update({
              co2eq: co2eqBigInt,
              co2eqYears: 100, // Default value
              unavailableReason: undefined,
              unavailableExplanation: undefined,
              inputMethodology:
                finalMethodology || existingValue.inputMethodology,
              sectorId: row.sectorId,
              subSectorId: row.subsectorId,
              subCategoryId: row.subcategoryId ?? undefined,
              lastUpdated: new Date(),
            });
            importedRows++;
          } else {
            // Create new inventory value with emissions
            inventoryValue = await db.models.InventoryValue.create({
              id: randomUUID(),
              inventoryId,
              gpcReferenceNumber: row.gpcRefNo,
              sectorId: row.sectorId,
              subSectorId: row.subsectorId,
              subCategoryId: row.subcategoryId ?? undefined,
              co2eq: co2eqBigInt,
              co2eqYears: 100, // Default value
              inputMethodology: finalMethodology,
              lastUpdated: new Date(),
            });
            importedRows++;
          }
          console.log(row);

          // Create ActivityValue if activity data or metadata is present
          // For direct-measure methodology, we need to store metadata (data source, data quality) even without activity data
          if (
            row.activityAmount ||
            row.activityType ||
            row.activityUnit ||
            row.activityDataSource ||
            row.activityDataQuality
          ) {
            try {
              // Get schema for this GPC reference to map fields correctly
              const hierarchyEntryForActivity =
                MANUAL_INPUT_HIERARCHY[row.gpcRefNo];

              // Get the methodology to determine field mappings
              const methodology = mappedMethodology
                ? hierarchyEntryForActivity?.methodologies?.find(
                    (m) => m.id === mappedMethodology,
                  )
                : hierarchyEntryForActivity?.directMeasure;

              // Get the activity from the methodology
              // For Methodology, check activities array; for DirectMeasure, use activityUnitsField
              let activityTitle: string;
              let activityId: string | undefined;

              if (
                methodology &&
                "activities" in methodology &&
                methodology.activities?.[0]
              ) {
                const activity = methodology.activities[0];
                activityTitle = activity["activity-title"] || "activity-value";
                activityId = activity.id;
              } else if (methodology?.activityUnitsField) {
                activityTitle = `activity-${methodology.activityUnitsField}`;
                activityId = undefined;
              } else {
                activityTitle = "activity-value";
                activityId = undefined;
              }

              // Get group-by field and its default value (exclusive option) if available
              let groupByField: string | undefined;
              let groupByDefaultValue: string | undefined;

              if (
                methodology &&
                "activities" in methodology &&
                methodology.activities?.[0]
              ) {
                const activity = methodology.activities[0];
                groupByField = activity["group-by"];

                // Find the exclusive option for the group-by field
                if (groupByField && activity["extra-fields"]) {
                  const groupByFieldDef = activity["extra-fields"].find(
                    (f: any) => f.id === groupByField && f.exclusive,
                  );
                  if (groupByFieldDef?.exclusive) {
                    groupByDefaultValue = groupByFieldDef.exclusive;
                  }
                }
              }

              // Build activityData JSONB object using schema mapping
              const activityData: Record<string, any> = {};

              // Map activity amount using activityTitle from schema
              if (row.activityAmount !== undefined) {
                activityData[activityTitle] = row.activityAmount.toString();
              }

              if (row.activityUnit) {
                // Map unit to translation key (e.g., "Kilograms (kg)" -> "units-kilograms")
                const mappedUnit = mapUnitToTranslationKey(row.activityUnit);
                const unitFieldName = `${activityTitle}-unit`;
                activityData[unitFieldName] = mappedUnit;
              }

              // Map activity type using activityTypeField from schema
              if (row.activityType && methodology?.activityTypeField) {
                // Map activity type to schema key (e.g., "Firewood" -> "fuel-type-firewood")
                const mappedActivityType = mapActivityTypeToSchemaKey(
                  row.activityType,
                  methodology,
                  row.gpcRefNo,
                );
                activityData[methodology.activityTypeField] =
                  mappedActivityType;
              } else if (row.activityType) {
                // Fallback if no schema mapping - still try to map it
                const mappedActivityType = mapActivityTypeToSchemaKey(
                  row.activityType,
                  methodology,
                  row.gpcRefNo,
                );
                activityData["activity-type"] = mappedActivityType;
              }

              // Store data source in activityData (frontend reads from here)
              if (row.activityDataSource) {
                activityData["data-source"] = row.activityDataSource;
              }

              // Set group-by field default value if available
              if (groupByField && groupByDefaultValue) {
                activityData[groupByField] = groupByDefaultValue;
              }

              // Build metadata JSONB object
              const metadata: Record<string, any> = {};

              // Set activityId from schema
              if (activityId) {
                metadata.activityId = activityId;
              }

              // Set activity title for metadata (used for display) - MUST match the key used in activityData
              metadata.activityTitle = activityTitle;

              // Store data source in metadata as sourceExplanation (for export/other purposes)
              if (row.activityDataSource) {
                metadata.sourceExplanation = row.activityDataSource;
              }

              if (row.activityDataQuality) {
                metadata.dataQuality = row.activityDataQuality;
              }

              if (row.emissionFactorSource) {
                metadata.emissionFactorName = row.emissionFactorSource;
              }

              if (row.emissionFactorDescription) {
                metadata.emissionFactorTypeReference =
                  row.emissionFactorDescription;
              }

              if (row.emissionFactorUnit) {
                metadata.emissionFactorUnit = row.emissionFactorUnit;
              }

              if (row.emissionFactorCO2 != null) {
                metadata.emissionFactorCO2 = row.emissionFactorCO2;
              }
              if (row.emissionFactorCH4 != null) {
                metadata.emissionFactorCH4 = row.emissionFactorCH4;
              }
              if (row.emissionFactorN2O != null) {
                metadata.emissionFactorN2O = row.emissionFactorN2O;
              }
              if (row.emissionFactorTotalCO2e != null) {
                metadata.emissionFactorTotalCO2e = row.emissionFactorTotalCO2e;
              }

              // emissionFactorType is a UUID field that we don't have in eCRF files
              // Setting as empty string as per the example structure
              metadata.emissionFactorType = "";

              // Convert activity CO2e to kilograms (if available)
              const activityCO2eq =
                totalCO2e && totalCO2e > 0
                  ? decimalToBigInt(new Decimal(totalCO2e).mul(1000))
                  : undefined;

              await db.models.ActivityValue.create({
                id: randomUUID(),
                inventoryValueId: inventoryValue.id,
                co2eq: activityCO2eq,
                co2eqYears: 100,
                activityData:
                  Object.keys(activityData).length > 0
                    ? activityData
                    : undefined,
                metadata:
                  Object.keys(metadata).length > 0 ? metadata : undefined,
                lastUpdated: new Date(),
              });
            } catch (activityError) {
              warnings.push(
                `Row ${row.rowIndex + 1}: Failed to create activity value: ${activityError instanceof Error ? activityError.message : "Unknown error"}`,
              );
              logger.error(
                {
                  err: activityError,
                  rowIndex: row.rowIndex,
                  gpcRefNo: row.gpcRefNo,
                },
                "Failed to create activity value",
              );
            }
          }
        } else if (row.notationKey) {
          console.log(
            `[Import] GPC ${row.gpcRefNo} - Processing notation key: "${row.notationKey}" (normalized: "${row.notationKey.toUpperCase()}")`,
          );
          // Handle notation keys only if there are NO emission values
          const unavailableReason =
            notationKeyMapping[row.notationKey.toUpperCase()];
          console.log(
            `[Import] GPC ${row.gpcRefNo} - Mapped notation key "${row.notationKey.toUpperCase()}" -> "${unavailableReason}"`,
          );

          if (!unavailableReason) {
            warnings.push(
              `Row ${row.rowIndex + 1}: Unknown notation key "${row.notationKey}", skipping`,
            );
            skippedRows++;
            continue;
          }

          // Create or update inventory value with notation key
          // Note: eCRF files don't typically include explanation, so we use a default
          const unavailableExplanation = `Imported from eCRF file with notation key: ${row.notationKey}`;

          if (existingValue) {
            // Update existing value with notation key (clear emissions)
            await existingValue.update({
              unavailableReason,
              unavailableExplanation,
              co2eq: undefined,
              co2eqYears: undefined,
              sectorId: row.sectorId,
              subSectorId: row.subsectorId,
              subCategoryId: row.subcategoryId ?? undefined,
              lastUpdated: new Date(),
            });
            importedRows++;
          } else {
            // Create new inventory value with notation key
            await db.models.InventoryValue.create({
              id: randomUUID(),
              inventoryId,
              gpcReferenceNumber: row.gpcRefNo,
              sectorId: row.sectorId,
              subSectorId: row.subsectorId,
              subCategoryId: row.subcategoryId ?? undefined,
              unavailableReason,
              unavailableExplanation,
              lastUpdated: new Date(),
            });
            importedRows++;
          }
        } else {
          // Skip rows with no emission values and no notation key
          skippedRows++;
          warnings.push(
            `Row ${row.rowIndex + 1}: Skipped - no emission values or notation key`,
          );
          continue;
        }
      } catch (error) {
        errors.push(
          `Row ${row.rowIndex + 1}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        skippedRows++;
        logger.error(
          { err: error, rowIndex: row.rowIndex, gpcRefNo: row.gpcRefNo },
          "Failed to import row",
        );
      }
    }

    return {
      totalRows: importResult.rowCount,
      importedRows,
      skippedRows,
      errors,
      warnings: [...importResult.warnings, ...warnings],
    };
  }
}
