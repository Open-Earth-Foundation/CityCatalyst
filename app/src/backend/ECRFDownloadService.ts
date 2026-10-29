import Excel, { Worksheet } from "exceljs";
import type { TFunction } from "i18next";
import createHttpError from "http-errors";
import {
  InventoryValueWithActivityValues,
  InventoryWithInventoryValuesAndActivityValues,
} from "@/util/types";
import { findMethodology } from "@/util/form-schema";
import i18next from "@/i18n/server";
import { toDecimal } from "@/util/helpers";
import Decimal from "decimal.js";
import { bigIntToDecimal } from "@/util/big_int";
import PopulationService from "@/backend/PopulationService";
import CityBoundaryService, {
  CityBoundary,
} from "@/backend/CityBoundaryService";
import { logger } from "@/services/logger";
import { toShort } from "@/util/notation-keys";
import fs from "fs";
import path from "path";

interface Template2Entry {
  "notation-key"?: string;
  explanation?: string;
  total?: bigint;
  [key: string]: bigint | string | undefined;
}

interface DataSection {
  notation_key?: string;
  activityValues: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export default class ECRFDownloadService {
  public static async downloadECRF(
    output: InventoryWithInventoryValuesAndActivityValues,
    lng: string,
  ) {
    return await this.writeToECRFFILE(output, lng);
  }

  private static async writeToECRFFILE(
    output: InventoryWithInventoryValuesAndActivityValues,
    lng: string,
  ) {
    // eCRF is an English GPC template. Always write English labels into cells
    // even when the user is viewing the app in another language (CC-1153).
    void lng;
    const t = i18next.getFixedT("en", "data");
    const workbook = new Excel.Workbook();
    try {
      // Load the workbook
      const templatePath = path.resolve(
        process.cwd(),
        "templates",
        "ecrf_template.xlsx",
      );

      if (!fs.existsSync(templatePath)) {
        logger.error(
          { err: `File not found at path: ${templatePath}` },
          "Error reading or writing Excel file",
        );
        throw new Error(`File not found at path: ${templatePath}`);
      }

      await workbook.xlsx.readFile(templatePath);
      await this.writeToSheet1(workbook, output, t);
      await this.writeToSheet2(workbook, output, t);
      await this.writeToSheet3(workbook, output, t);
      // Save the modified workbook
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      logger.info("Workbook has been generated successfully");
      return buffer;
    } catch (error) {
      logger.error({ err: error }, "Error reading or writing Excel file");
      throw createHttpError.InternalServerError(
        "Error reading or writing Excel file",
      );
    }
  }

  private static async writeToSheet1(
    workbook: Excel.Workbook,
    output: InventoryWithInventoryValuesAndActivityValues,
    t: TFunction,
  ) {
    // fetch population data

    const city = output.city;
    const year = output.year;

    let cityPopulationData = null;
    let cityBoundaryData: CityBoundary | null = null;
    try {
      cityPopulationData = await PopulationService.getPopulationDataForCityYear(
        city.cityId,
        year as number,
      );
      cityBoundaryData = await CityBoundaryService.getCityBoundary(
        city.locode as string,
      );
    } catch {
      logger.warn("Failed to fetch city boundary or population");
    }

    // prepare the data for sheet 1
    const sheetData: Record<string, unknown> = {
      inventory_type: t?.(output.inventoryType ?? ""),
      city_country: city.country,
      city_name: city.name,
      city_region: city.region,
      inventory_year: year,
      city_population: cityPopulationData?.population,
      city_area: cityBoundaryData?.area,
    };

    const worksheet = workbook.getWorksheet(1); // Get the worksheet by index (1st sheet)

    worksheet?.eachRow((row) => {
      const placeholderCell = row.getCell(3);
      if (placeholderCell.value && typeof placeholderCell.value === "string") {
        const cellValue = placeholderCell.value as string;
        const placeholderMatch = cellValue.match(/{{(.*?)}}/);
        if (placeholderMatch) {
          const fieldName = placeholderMatch[1] as string;
          const replacementValue = sheetData[fieldName];
          placeholderCell.value = (replacementValue ?? "N/A") as Excel.CellValue;
        }
      }
    });
  }

  private static async writeToSheet2(
    workbook: Excel.Workbook,
    output: InventoryWithInventoryValuesAndActivityValues,
    t: TFunction,
  ) {
    const sectorNameMapping: Record<string, string> = {
      I: `stationary`,
      II: `transport`,
      III: `waste`,
      IV: `ippu`,
      V: `afolu`,
    };

    const totals: Record<string, bigint> = {
      stationary1: 0n,
      stationary2: 0n,
      stationary3: 0n,
      transport1: 0n,
      transport2: 0n,
      transport3: 0n,
      waste1: 0n,
      waste2: 0n,
      waste3: 0n,
      afolu1: 0n,
      afolu2: 0n,
      afolu3: 0n,
      ippu1: 0n,
      ippu2: 0n,
    };

    // prepare the data for sheet 2
    const dataDictionary = this.transformDataForTemplate2(output);
    const fugitive_emissions_data =
      this.groupFugitiveEmissionData(dataDictionary);
    totals.stationary1 = fugitive_emissions_data?.total;

    const updatedDataDictionary: Record<string, Template2Entry> = {
      ...dataDictionary,
      fugitive: fugitive_emissions_data,
    };

    // now loop over the rows and columns.
    const worksheet = workbook.getWorksheet(2);

    worksheet?.eachRow((row) => {
      let justificationString = "";
      // loop over each cell and then check if it's a placeholder.
      row.eachCell((cell) => {
        const cellValue = cell.value as string;
        const placeholderMatch = cellValue.match(/{{(.*?)}}/);
        if (placeholderMatch) {
          let replacementValue = null; // split the placeholders
          const fieldName = placeholderMatch[1];

          if (fieldName === "explanation-institutional-missing") {
            cell.value = t("explanation-institutional-missing");
            return;
          }

          const referenceNoIdentifier = fieldName.split("_")[0];
          const targetIdentifier = fieldName.split("_")[1];

          if (targetIdentifier === "full-total") {
            // if sector total placeholder read from totals
            replacementValue = totals[referenceNoIdentifier];
          } else if (referenceNoIdentifier in updatedDataDictionary) {
            replacementValue =
              updatedDataDictionary[referenceNoIdentifier]?.[targetIdentifier]; // eg dataDictionary.I.total or dataDictionary.I.notation-key

            // build up the justification string for each row
            if (targetIdentifier === "notation-key") {
              const explanation =
                updatedDataDictionary[referenceNoIdentifier]?.["explanation"];
              if (explanation) {
                justificationString +=
                  (justificationString ? `, ` : "") + explanation;
              }
            }
            // build up the totals for each sector scope combo
            if (
              targetIdentifier === "total" &&
              !(referenceNoIdentifier === "fugitive")
            ) {
              const refSplit = referenceNoIdentifier.split(".");
              const sectorNo = refSplit[0];
              const sectorName = sectorNameMapping[sectorNo];
              const scopeNo = refSplit[refSplit.length - 1];
              totals[`${sectorName}${scopeNo}`] += replacementValue
                ? BigInt(replacementValue)
                : 0n;
            }
          } else if (targetIdentifier === "notation-key") {
            // mark as Not estimated
            replacementValue = "NE";
          } else if (targetIdentifier === "explanation") {
            replacementValue = justificationString;
          }
          const entry = updatedDataDictionary[referenceNoIdentifier];
          const hasNotationKey = Boolean(entry?.["notation-key"]);
          // A GPC row is either a notation key or a value, never both.
          if (targetIdentifier === "total" && hasNotationKey) {
            cell.value = "";
            return;
          }
          if (
            targetIdentifier === "notation-key" &&
            entry &&
            !hasNotationKey &&
            entry.total != null
          ) {
            cell.value = "";
            return;
          }
          // Inventory co2eq is stored in kg; eCRF_2 expects tCO2e.
          if (
            (targetIdentifier === "total" ||
              targetIdentifier === "full-total") &&
            replacementValue != null &&
            replacementValue !== ""
          ) {
            const kg = this.toNullableBigInt(replacementValue) ?? 0n;
            cell.value = Number(kg) / 1000;
          } else {
            cell.value = replacementValue?.toString() ?? "";
          }
        }
      });
    });

    // create a new object
  }

  private static async writeToSheet3(
    workbook: Excel.Workbook,
    output: InventoryWithInventoryValuesAndActivityValues,
    t: TFunction,
  ) {
    const worksheet = workbook.getWorksheet(3); // Get the worksheet by index (3rd sheet)
    // Fetch data from the database
    const inventoryValues = output.inventoryValues;

    // Transform data into a dictionary for easy access
    const dataDictionary = this.transformDataForTemplate3(
      inventoryValues as InventoryValueWithActivityValues[],
      output.year as number,
      t,
    );

    const visitedScopes = {};

    // Walk bottom → top so inserting extra activity rows does not shift
    // unprocessed template GPC refs (which left III.4.x etc. as NE).
    if (worksheet) {
      for (let rowNumber = worksheet.rowCount; rowNumber >= 2; rowNumber--) {
        const row = worksheet.getRow(rowNumber);
        row.eachCell((cell) => {
          cell.style = { ...cell.style };
        });

        const referenceNumberCell = row.getCell(2);
        const referenceNumberValue = referenceNumberCell.value;

        if (referenceNumberCell && typeof referenceNumberValue === "string") {
          const dataSection = dataDictionary[referenceNumberValue];
          if (dataSection) {
            this.replacePlaceholdersInRow(
              row,
              dataSection,
              rowNumber,
              visitedScopes,
              worksheet,
            );
          } else {
            this.markRowAsNotEstimated(row, {
              inventoryYear: output.year as number,
            });
          }
        } else {
          this.markRowAsNotEstimated(row, {
            inventoryYear: output.year as number,
          });
        }
      }

      // Clear leftover {{…}} without turning value rows into NE.
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        this.clearLeftoverPlaceholders(worksheet.getRow(rowNumber), {
          inventoryYear: output.year as number,
        });
      }
    }
  }

  private static groupFugitiveEmissionData(
    subcategoryDataGroup: Record<
      string,
      {
        total?: bigint;
        "notation-key"?: string;
        explanation?: string;
      }
    >,
  ) {
    const {
      total: totalI71 = BigInt(0),
      "notation-key": keyI71 = "",
      explanation: explanationI71 = "",
    } = subcategoryDataGroup["I.7.1"] || {};
    const {
      total: totalI81 = BigInt(0),
      "notation-key": keyI81 = "",
      explanation: explanationI81 = "",
    } = subcategoryDataGroup["I.8.1"] || {};

    // Calculate fugitive emissions total
    const fugitiveEmissionsTotal = totalI71 + totalI81;

    // Combine notation keys
    const fugitiveEmissionsNotationKey = [keyI71, keyI81]
      .filter(Boolean)
      .join(" / ");

    const fugitiveEmissionsUnavailableReasons = [explanationI71, explanationI81]
      .filter(Boolean)
      .join(", ");

    return {
      total: fugitiveEmissionsTotal,
      "notation-key": fugitiveEmissionsNotationKey,
      explanation: fugitiveEmissionsUnavailableReasons,
    };
  }

  private static transformDataForTemplate2(
    output: InventoryWithInventoryValuesAndActivityValues,
  ): Record<string, Template2Entry> {
    const dataDictionary: Record<string, Template2Entry> = {};

    output.inventoryValues.map((inventoryValue) => {
      const notationKey =
        toShort(inventoryValue.unavailableReason) ?? undefined;
      dataDictionary[inventoryValue.gpcReferenceNumber as string] = {
        "notation-key": notationKey,
        explanation: inventoryValue.unavailableExplanation ?? undefined,
        total: notationKey
          ? undefined
          : (this.toNullableBigInt(inventoryValue.co2eq) ?? 0n),
      };
    });

    return dataDictionary;
  }

  private static transformDataForTemplate3(
    inventoryValues: InventoryValueWithActivityValues[],
    inventoryYear: number,
    t: TFunction,
  ): Record<string, DataSection> {
    // Get the translation

    const dataDictionary: Record<string, DataSection> = {};
    inventoryValues.forEach((inventoryValue) => {
      const gpcRefNo = inventoryValue.gpcReferenceNumber;
      const activityValues = inventoryValue.activityValues || [];

      // if there is a source, this is third party data
      if (inventoryValue.dataSource) {
        dataDictionary[gpcRefNo as string] = {
          inventory_year: inventoryYear,
          gpc_reference_number: inventoryValue.gpcReferenceNumber,
          notation_key:
            toShort(inventoryValue.unavailableReason) ?? undefined,
          activityValues: [
            {
              activity_type: null,
              emission_factor_unit: null,
              emission_factor_source: null,
              emission_co2: null,
              emission_ch4: null,
              emission_n2o: null,
              activity_amount: null,
              activity_unit: null,
              activity_data_quality: inventoryValue.dataSource?.dataQuality,
              activity_data_source: inventoryValue.dataSource?.datasourceName,
              total_co2e: toDecimal(inventoryValue.co2eq as bigint)
                ?.div(new Decimal("1e3"))
                .toNumber(),
            },
          ],
        };
      } else {
        const methodologyDescription = inventoryValue.inputMethodology;
        const methodology = findMethodology(
          inventoryValue.inputMethodology as string,
          gpcRefNo,
        );
        const activityKey = methodology?.activityTypeField as string;

        const mappedActivities = activityValues.map((activityValue) => {
            const activityTitleKey =
              activityValue.metadata?.activityTitle?.toString() ?? "";
            const dataQuality = activityValue.metadata?.dataQuality;
            const dataSource =
              activityValue.activityData?.["data-source"] ??
              activityValue.metadata?.sourceExplanation;
            const activityAmount =
              activityValue.activityData?.[activityTitleKey];
            const activityUnit = t(
              String(
                activityValue.activityData?.[`${activityTitleKey}-unit`] ??
                  "",
              ),
            );
            // eCRF imports often have empty gasValues on the ActivityValue
            // (gases live on InventoryValue / activityData). Treat missing
            // gases and missing emissions factors as null — never BigInt(undefined).
            const gasValues = activityValue.gasValues ?? [];
            const co2_gas = gasValues.find((g) => g.gas === "CO2");
            const ch4_gas = gasValues.find((g) => g.gas === "CH4");
            const n2o_gas = gasValues.find((g) => g.gas === "N2O");

            const emission_co2 =
              co2_gas?.emissionsFactor?.emissionsPerActivity ?? null;
            const emission_ch4 =
              ch4_gas?.emissionsFactor?.emissionsPerActivity ?? null;
            const emission_n2o =
              n2o_gas?.emissionsFactor?.emissionsPerActivity ?? null;

            let ghg_co2_kg = this.toNullableBigInt(co2_gas?.gasAmount);
            let ghg_ch4_kg = this.toNullableBigInt(ch4_gas?.gasAmount);
            let ghg_n2o_kg = this.toNullableBigInt(n2o_gas?.gasAmount);

            // Fallback: eCRF import stores tonnes on activityData without
            // attaching GasValue rows to the activity.
            const activityData = activityValue.activityData ?? {};
            if (ghg_co2_kg == null) {
              ghg_co2_kg = this.tonnesFieldToKg(activityData.co2_amount);
            }
            if (ghg_ch4_kg == null) {
              ghg_ch4_kg = this.tonnesFieldToKg(activityData.ch4_amount);
            }
            if (ghg_n2o_kg == null) {
              ghg_n2o_kg = this.tonnesFieldToKg(activityData.n2o_amount);
            }

            // Template columns are "GHGs (metric tonnes CO2e)" — convert kg → t.
            return {
              ghg_co2:
                ghg_co2_kg != null
                  ? bigIntToDecimal(ghg_co2_kg).div(1000).toNumber()
                  : null,
              // AR5 GWP factors (same as pre-fix export behaviour)
              ghg_ch4:
                ghg_ch4_kg != null
                  ? bigIntToDecimal(ghg_ch4_kg * 28n).div(1000).toNumber()
                  : null,
              ghg_n2o:
                ghg_n2o_kg != null
                  ? bigIntToDecimal(ghg_n2o_kg * 265n).div(1000).toNumber()
                  : null,
              activity_type: t(
                String(activityValue.activityData?.[activityKey] ?? ""),
              ),
              emission_factor_unit: null,
              emission_co2,
              emission_ch4,
              emission_n2o,
              activity_amount: activityAmount,
              emission_factor_source:
                activityValue.metadata?.emissionFactorName,
              emission_factor_description:
                activityValue.metadata?.emissionFactorTypeReference,
              activity_unit: activityUnit,
              methodology: t(methodologyDescription ?? ""),
              activity_data_quality: dataQuality,
              activity_data_source: dataSource,
              total_co2e: toDecimal(activityValue.co2eq as bigint)
                ?.div(new Decimal("1e3"))
                .toNumber(),
            };
          });

        // No activity rows: still emit inventory total so sheet 3 is not NE-only.
        const activityRows =
          mappedActivities.length > 0
            ? mappedActivities
            : [
                {
                  activity_type: null,
                  emission_factor_unit: null,
                  emission_co2: null,
                  emission_ch4: null,
                  emission_n2o: null,
                  activity_amount: null,
                  activity_unit: null,
                  activity_data_quality: null,
                  activity_data_source: null,
                  methodology: t(methodologyDescription ?? ""),
                  total_co2e: toDecimal(inventoryValue.co2eq as bigint)
                    ?.div(new Decimal("1e3"))
                    .toNumber(),
                },
              ];

        dataDictionary[gpcRefNo as string] = {
          inventory_year: inventoryYear,
          gpc_reference_number: inventoryValue.gpcReferenceNumber,
          notation_key:
            toShort(inventoryValue.unavailableReason) ?? undefined,
          input_methodology: t(inventoryValue.inputMethodology ?? ""),
          activityValues: activityRows,
        };
      }
    });
    return dataDictionary;
  }

  private static replacePlaceholdersInRow(
    row: Excel.Row,
    dataSection: DataSection,
    rowNumber: number,
    visitedScopes: Record<string, boolean>,
    worksheet: Worksheet,
  ) {
    const referenceCell = row.getCell(2);
    const referenceValue = referenceCell.value;

    const inventoryYear =
      typeof dataSection.inventory_year === "number"
        ? dataSection.inventory_year
        : undefined;
    this.writeInventoryYear(row, inventoryYear);

    if (typeof referenceValue == "string" && referenceValue in visitedScopes) {
      // Extra template rows for the same GPC ref (e.g. I.4.4 CHP/heat) after
      // multi-activity insert — clear placeholders rather than leave {{…}}.
      this.markRowAsNotEstimated(row, { inventoryYear });
      return;
    }

    if (dataSection.notation_key) {
      this.markRowAsNotEstimated(row, {
        notation: dataSection.notation_key,
        inventoryYear,
      });
      return;
    }

    const targetRows = [row];

    if (dataSection.activityValues.length > 1) {
      const rowCount = dataSection.activityValues.length - 1;
      for (let i = 0; i < rowCount; i++) {
        const newRow = this.cloneRowAndInsertInWorkSheet(
          rowNumber + 1 + i,
          row,
          worksheet,
        );
        targetRows.push(newRow);
      }
    }

    targetRows.forEach((targetRow, index) => {
      dataSection = {
        ...dataSection,
        ...dataSection.activityValues[index],
      };
      targetRow.eachCell((cell, colNumber) => {
        // dealing with Notation keys
        if (cell.value && typeof cell.value === "string") {
          const cellValue = cell.value as string;
          const placeholderMatch = cellValue.match(/{{(.*?)}}/);
          if (placeholderMatch) {
            const fieldName = placeholderMatch[1];
            const replacementValue = dataSection[fieldName];

            if (fieldName === "no_key" && dataSection["notation_key"]) {
              cell.value = dataSection["notation_key"];
              return;
            } else if (replacementValue !== undefined) {
              cell.value = replacementValue as Excel.CellValue;
            } else {
              logger.warn(
                `No data found for field '${fieldName}' at row ${rowNumber}, column ${colNumber}`,
              );
              cell.value = ""; // remove the placeholder when done
            }
          }
        }
      });
    });

    visitedScopes[referenceValue as string] = true;
  }

  private static writeInventoryYear(
    row: Excel.Row,
    inventoryYear?: number,
  ) {
    if (inventoryYear == null) return;
    // eCRF_3 column A is a year dropdown seeded with "Please select", not {{inventory_year}}.
    row.getCell(1).value = inventoryYear;
  }

  private static markRowAsNotEstimated(
    row: Excel.Row,
    options?: { notation?: string; inventoryYear?: number },
  ) {
    this.writeInventoryYear(row, options?.inventoryYear);
    row.eachCell((cell) => {
      if (cell.value && typeof cell.value === "string") {
        const cellValue = cell.value as string;
        const placeholderMatch = cellValue.match(/{{(.*?)}}/);
        if (placeholderMatch) {
          const fieldName = placeholderMatch[1];
          if (fieldName === "no_key") {
            cell.value = options?.notation || "NE";
          } else if (
            fieldName === "inventory_year" &&
            options?.inventoryYear != null
          ) {
            cell.value = options.inventoryYear;
          } else {
            cell.value = "";
          }
        }
      }
    });
  }

  /** Strip leftover placeholders after fill. Never default leftover no_key to NE. */
  private static clearLeftoverPlaceholders(
    row: Excel.Row,
    options?: { inventoryYear?: number },
  ) {
    this.writeInventoryYear(row, options?.inventoryYear);
    row.eachCell((cell) => {
      if (cell.value && typeof cell.value === "string") {
        const cellValue = cell.value as string;
        const placeholderMatch = cellValue.match(/{{(.*?)}}/);
        if (placeholderMatch) {
          const fieldName = placeholderMatch[1];
          if (
            fieldName === "inventory_year" &&
            options?.inventoryYear != null
          ) {
            cell.value = options.inventoryYear;
          } else {
            cell.value = "";
          }
        }
      }
    });
  }

  /** Safe BigInt for optional gas amounts — never throw on null/undefined. */
  private static toNullableBigInt(value: unknown): bigint | null {
    if (value == null || value === "") return null;
    try {
      return BigInt(value as bigint | number | string);
    } catch {
      return null;
    }
  }

  /** Convert activityData tonne fields (eCRF import) to kg bigint. */
  private static tonnesFieldToKg(value: unknown): bigint | null {
    if (typeof value !== "number" || Number.isNaN(value)) return null;
    try {
      return BigInt(new Decimal(value).mul(1000).trunc().toString());
    } catch {
      return null;
    }
  }

  private static cloneRowAndInsertInWorkSheet(
    currentRowNumber: number,
    templateRow: Excel.Row,
    worksheet: Worksheet,
  ) {
    worksheet.insertRow(currentRowNumber, []);

    const newRow = worksheet.getRow(currentRowNumber);

    // Copy the style and values from the template row to the new row
    this.copyRow(templateRow, newRow);
    return newRow;
  }

  private static copyRow(sourceRow: Excel.Row, targetRow: Excel.Row) {
    targetRow.height = sourceRow.height;

    sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const targetCell = targetRow.getCell(colNumber);

      // Copy styles
      targetCell.style = { ...cell.style };

      // Copy value
      targetCell.value = cell.value;
    });
  }
}
