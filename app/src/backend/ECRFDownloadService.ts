import Excel, { Worksheet } from "exceljs";
import createHttpError from "http-errors";
import {
  InventoryValueWithActivityValues,
  InventoryWithInventoryValuesAndActivityValues,
} from "@/util/types";
import { findMethodology } from "@/util/form-schema";
import { translationFunc } from "@/i18n/server";
import { toDecimal } from "@/util/helpers";
import Decimal from "decimal.js";
import { bigIntToDecimal } from "@/util/big_int";
import PopulationService from "@/backend/PopulationService";
import CityBoundaryService from "@/backend/CityBoundaryService";

const ECRF_TEMPLATE_PATH = "./templates/ecrf_template.xlsx";

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
    const { t } = await translationFunc(lng, "data");
    const workbook = new Excel.Workbook();
    try {
      // Load the workbook
      await workbook.xlsx.readFile(ECRF_TEMPLATE_PATH);
      await this.writeToSheet1(workbook, output, t);
      await this.writeToSheet2(workbook, output, t);
      await this.writeToSheet3(workbook, output, t);
      // Save the modified workbook
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      console.log("Workbook has been generated successfully");
      return buffer;
    } catch (error) {
      console.log("Error reading or writing Excel file", error);
      throw createHttpError.InternalServerError(
        "Error reading or writing Excel file",
      );
    }
  }

  private static async writeToSheet1(
    workbook: Excel.Workbook,
    output: InventoryWithInventoryValuesAndActivityValues,
    t: any,
  ) {
    // fetch population data

    const city = output.city;
    const year = output.year;

    let cityPopulationData = null;
    let cityBoundaryData: Record<string, any> = {};
    try {
      cityPopulationData = await PopulationService.getPopulationDataForCityYear(
        city.cityId,
        year as number,
      );
      cityBoundaryData = await CityBoundaryService.getCityBoundary(
        city.locode as string,
      );
    } catch (e) {
      console.warn("Failed to fetch city boundary or population");
    }

    // prepare the data for sheet 1
    const sheetData: Record<string, any> = {
      inventory_type: t?.(output.inventoryType),
      city_country: city.country,
      city_name: city.name,
      city_region: city.region,
      inventory_year: year,
      city_population: cityPopulationData?.population,
      city_area: cityBoundaryData?.area,
    };

    const worksheet = workbook.getWorksheet(1); // Get the worksheet by index (1st sheet)

    worksheet?.eachRow((row, rowNumber) => {
      const placeholderCell = row.getCell(3);
      if (placeholderCell.value && typeof placeholderCell.value === "string") {
        const cellValue = placeholderCell.value as string;
        const placeholderMatch = cellValue.match(/{{(.*?)}}/);
        if (placeholderMatch) {
          const fieldName = placeholderMatch[1] as string;
          const replacementValue = sheetData[fieldName];
          placeholderCell.value = replacementValue ?? "N/A";
        }
      }
    });
  }

  private static async writeToSheet2(
    workbook: Excel.Workbook,
    output: InventoryWithInventoryValuesAndActivityValues,
    t: any,
  ) {
    const sectorNameMapping: Record<string, string> = {
      I: `stationary`,
      II: `transport`,
      III: `waste`,
      IV: `ippu`,
      V: `afolu`,
    };

    const totals: Record<string, any> = {
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
    const dataDictionary = this.transformDataForTemplate2(output, t);
    const fugitive_emissions_data =
      this.groupFugitiveEmissionData(dataDictionary);
    totals.stationary1 = fugitive_emissions_data?.total;

    const updatedDataDictionary: Record<string, any> = {
      ...dataDictionary,
      fugitive: fugitive_emissions_data,
    };

    // now loop over the rows and columns.
    const worksheet = workbook.getWorksheet(2);

    worksheet?.eachRow((row, rowNumber) => {
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
          }
          cell.value = replacementValue?.toString() ?? "";
        }
      });
    });

    // create a new object
  }

  private static async writeToSheet3(
    workbook: Excel.Workbook,
    output: InventoryWithInventoryValuesAndActivityValues,
    t: any,
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

    worksheet?.eachRow((row, rowNumber) => {
      // maintain the styling
      row.eachCell((cell) => {
        cell.style = { ...cell.style };
      });

      if (rowNumber === 1) return; // Skip the first row (contains the header)

      const referenceNumberCell = row.getCell(2);
      const referenceNumberValue = referenceNumberCell.value;

      if (referenceNumberCell && typeof referenceNumberValue === "string") {
        const dataSection = dataDictionary[referenceNumberValue];
        // if the activityValues > 1, then we need to add rows
        if (dataSection) {
          this.replacePlaceholdersInRow(
            row,
            dataSection,
            rowNumber,
            visitedScopes,
            worksheet,
          );
        } else {
          this.markRowAsNotEstimated(row);
        }
      }
      this.markRowAsNotEstimated(row);
    });
  }

  private static groupFugitiveEmissionData(
    subcategoryDataGroup: Record<
      string,
      {
        total?: bigint;
        "notation-key"?: string;
      }
    >,
  ) {
    const { total: totalI71 = BigInt(0), "notation-key": keyI71 = "" } =
      subcategoryDataGroup["I.7.1"] || {};
    const { total: totalI81 = BigInt(0), "notation-key": keyI81 = "" } =
      subcategoryDataGroup["I.8.1"] || {};

    // Calculate fugitive emissions total
    const fugitiveEmissionsTotal = totalI71 + totalI81;

    // Combine notation keys
    const fugitiveEmissionsNotationKey = [keyI71, keyI81]
      .filter(Boolean)
      .join(" / ");

    // Build explanation string
    const explanationParts = [];
    if (keyI71) explanationParts.push(`I.7.1: ${keyI71}`);
    if (keyI81) explanationParts.push(`I.8.1: ${keyI81}`);
    const explanation = explanationParts.join(",");

    return {
      total: fugitiveEmissionsTotal,
      "notation-key": fugitiveEmissionsNotationKey,
      explanation,
    };
  }

  private static transformDataForTemplate2(
    output: InventoryWithInventoryValuesAndActivityValues,
    t: any,
  ): Record<string, any> {
    const dataDictionary: Record<string, any> = {};

    output.inventoryValues.map((inventoryValue) => {
      dataDictionary[inventoryValue.gpcReferenceNumber as string] = {
        "notation-key": inventoryValue.unavailableReason?.split("-")[1],
        total: inventoryValue.unavailableReason
          ? 0n
          : BigInt(inventoryValue.co2eq ?? 0),
      };
    });

    return dataDictionary;
  }

  private static transformDataForTemplate3(
    inventoryValues: InventoryValueWithActivityValues[],
    inventoryYear: number,
    t: any,
  ): Record<string, any> {
    // Get the translation

    const dataDictionary: Record<string, any> = {};
    inventoryValues.forEach((inventoryValue) => {
      const gpcRefNo = inventoryValue.gpcReferenceNumber;
      const activityValues = inventoryValue.activityValues || [];

      // if there is a source, this is third party data
      if (inventoryValue.dataSource) {
        dataDictionary[gpcRefNo as string] = {
          inventory_year: inventoryYear,
          gpc_reference_number: inventoryValue.gpcReferenceNumber,
          notation_key: inventoryValue.unavailableReason,
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
        let methodologyDescription = inventoryValue.inputMethodology;
        const methodology = findMethodology(
          inventoryValue.inputMethodology as string,
          gpcRefNo,
        );
        const activityKey = methodology?.activityTypeField as string;

        dataDictionary[gpcRefNo as string] = {
          // InventoryValue fields
          inventory_year: inventoryYear,
          gpc_reference_number: inventoryValue.gpcReferenceNumber,
          notation_key: inventoryValue.unavailableReason,
          input_methodology: t(inventoryValue.inputMethodology),
          activityValues: activityValues.map((activityValue) => {
            let activityTitleKey = activityValue.metadata?.activityTitle;
            let dataQuality = activityValue.metadata?.dataQuality;
            let dataSource = activityValue.activityData?.["data-source"];
            let activityAmount = activityValue.activityData?.[activityTitleKey];
            let activityUnit = t(
              activityValue.activityData?.[`${activityTitleKey}-unit`],
            );
            let emission_co2 = null;
            let emission_ch4 = null;
            let emission_n2o = null;
            let ghg_co2 = null;
            let ghg_ch4 = null;
            let ghg_n2o = null;

            if (activityValue.gasValues) {
              let co2_gas = activityValue.gasValues.find(
                (g) => g.gas === "CO2",
              );
              let ch4_gas = activityValue.gasValues.find(
                (g) => g.gas === "CH4",
              );
              let n2o_gas = activityValue.gasValues.find(
                (g) => g.gas === "N2O",
              );

              emission_co2 = co2_gas?.emissionsFactor.emissionsPerActivity;
              emission_ch4 = ch4_gas?.emissionsFactor.emissionsPerActivity;
              emission_n2o = n2o_gas?.emissionsFactor.emissionsPerActivity;

              ghg_co2 = BigInt(co2_gas?.gasAmount as bigint);
              ghg_ch4 = BigInt(ch4_gas?.gasAmount as bigint) * BigInt(28);
              ghg_n2o = BigInt(n2o_gas?.gasAmount as bigint) * BigInt(265);
            }
            return {
              ghg_co2: bigIntToDecimal(ghg_co2 as bigint).toNumber(),
              ghg_ch4: bigIntToDecimal(ghg_ch4 as bigint).toNumber(),
              ghg_n2o: bigIntToDecimal(ghg_n2o as bigint).toNumber(),
              activity_type: t(activityValue.activityData?.[activityKey]),
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
              methodology: t(methodologyDescription),
              activity_data_quality: dataQuality,
              activity_data_source: dataSource,
              total_co2e: toDecimal(activityValue.co2eq as bigint)
                ?.div(new Decimal("1e3"))
                .toNumber(),
            };
          }),
        };
      }
    });
    return dataDictionary;
  }

  private static replacePlaceholdersInRow(
    row: Excel.Row,
    dataSection: Record<string, any>, // TODO: Define a type for this
    rowNumber: number,
    visitedScopes: Record<string, any>,
    worksheet: Worksheet,
  ) {
    const referenceCell = row.getCell(2);
    const referenceValue = referenceCell.value;

    if (typeof referenceValue == "string" && referenceValue in visitedScopes) {
      return;
    }

    if (dataSection.notation_key) {
      this.markRowAsNotEstimated(
        row,
        dataSection["notation_key"].split("-")[1],
      );
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

            // if field name is notation key, replace with unavailable explanation
            if (fieldName === "no_key" && dataSection["notation_key"]) {
              // the stored value looks like "reason_NO", "reason_NE", etc.
              cell.value = dataSection["notation_key"].split("-")[1];
              return;
            } else if (replacementValue !== undefined) {
              cell.value = replacementValue;
            } else {
              console.warn(
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

  private static markRowAsNotEstimated(row: Excel.Row, notation?: string) {
    row.eachCell((cell) => {
      if (cell.value && typeof cell.value === "string") {
        const cellValue = cell.value as string;
        const placeholderMatch = cellValue.match(/{{(.*?)}}/);
        if (placeholderMatch) {
          const fieldName = placeholderMatch[1];
          if (fieldName === "no_key") {
            cell.value = notation || "NE"; // Not Estimated
          } else {
            cell.value = ""; // remove the placeholder when
          }
        }
      }
    });
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
