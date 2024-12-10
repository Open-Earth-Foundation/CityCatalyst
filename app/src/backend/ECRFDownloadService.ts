import Excel, { Worksheet } from "exceljs";
import { InventoryValue } from "@/models/InventoryValue";
import { ActivityValue } from "@/models/ActivityValue";
import createHttpError from "http-errors";
import { InventoryResponse } from "@/util/types";
import { findMethodology } from "@/util/form-schema";
import { translationFunc } from "@/i18n/server";
import { toDecimal } from "@/util/helpers";
import Decimal from "decimal.js";
import { bigIntToDecimal } from "@/util/big_int";

type InventoryValueWithActivityValues = InventoryValue & {
  activityValues: ActivityValue[];
};

export type InventoryWithInventoryValuesAndActivityValues =
  InventoryResponse & {
    inventoryValues: InventoryValueWithActivityValues[];
  };

const ECRF_TEMPLATE_PATH = "./templates/ecrf_template.xlsx";

export default class ECRFDownloadService {
  public static async downloadECRF(
    output: InventoryWithInventoryValuesAndActivityValues,
    lng: string,
  ) {
    return await this.writeTOECRFFILE(output, lng);
  }

  private static async writeTOECRFFILE(
    output: InventoryWithInventoryValuesAndActivityValues,
    lng: string,
  ) {
    const { t } = await translationFunc(lng, "data");
    const workbook = new Excel.Workbook();
    try {
      // Load the workbook
      await workbook.xlsx.readFile(ECRF_TEMPLATE_PATH);
      const worksheet = workbook.getWorksheet(3); // Get the worksheet by index (3rd sheet)
      // Fetch data from the database
      const inventoryValues = output.inventoryValues;

      // Transform data into a dictionary for easy access
      const dataDictionary = this.transformDataForTemplate(
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

  private static transformDataForTemplate(
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
