import Excel from "exceljs";
import { db } from "@/models";
import { InventoryValue } from "@/models/InventoryValue";
import { ActivityValue } from "@/models/ActivityValue";

type InventoryValueWithActivityValues = InventoryValue & {
  activityValues: ActivityValue[];
};

const fakeDictionary: Record<string, any> = {
  // "I.1.1": {
  //   activity_amount: 1,
  //   activity_unit: "kg",
  //   activity_methodology_description: "Methodology 1",
  //   activity_source: "Source 1",
  //   activity_quality: "Quality 1", // when more than one exists, use the most common
  //   ef_unit: "kg/m3",
  //   ef_co2_amount: 1,
  //   ef_n2o_amount: 1,
  //   ef_ch4_amount: 1,
  //   ef_description: "Description 1",
  //   ef_source: "Source 1",
  //   ghg_tonnes_co2: 2000,
  // },
  // "I.2.1": {
  //   activity_amount: 2,
  //   activity_unit: "kg",
  //   activity_methodology_description: "Methodology 2",
  //   activity_source: "Source 2",
  //   activity_quality: "Quality 2", // when more than one exists, use the most common
  //   ef_unit: "kg/m3",
  //   ef_co2_amount: 2,
  //   ef_n2o_amount: 2,
  //   ef_ch4_amount: 2,
  //   ef_description: "Description 2",
  //   ef_source: "Source 2",
  //   ghg_tonnes_co2: 4000,
  // },
};

const ECRF_TEMPLATE_PATH = "./templates/eCRF_Export_template.xlsx";

export default class ECRFDownloadService {
  public static async downloadECRF(inventoryId: string) {
    return await this.writeTOECRFFILE(inventoryId);
  }

  private static async writeTOECRFFILE(inventoryId: string) {
    const workbook = new Excel.Workbook();

    try {
      // Load the workbook
      await workbook.xlsx.readFile(ECRF_TEMPLATE_PATH);
      const worksheet = workbook.getWorksheet(3); // Get the worksheet by index (3rd sheet)

      // Fetch data from the database
      const inventoryValues =
        await this.queryDbForInventoryValueAndAvtivityValue(inventoryId);

      // Transform data into a dictionary for easy access
      const dataDictionary = this.transformDataForTemplate(
        inventoryValues as InventoryValueWithActivityValues[],
      );

      // Iterate over all rows to find and replace placeholders
      worksheet?.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip the first row (contains the header)

        const gpcRefCell = row.getCell(2); // Assuming GPC ref. no. is in column 2
        const gpcRefNo = gpcRefCell.value;

        const referenceNumberCell = row.getCell(2);
        const referenceNumberValue = referenceNumberCell.value;

        if (referenceNumberCell && typeof referenceNumberValue === "string") {
          const dataSection = dataDictionary[referenceNumberValue];
          if (dataSection) {
            this.replacePlaceholdersInRow(row, dataSection, rowNumber);
          }
        }

        // if (placeholderValue && typeof placeholderValue === "string") {
        //   const dataSection = fakeDictionary[placeholderValue];
        //
        //   if (dataSection) {
        //     // Loop through each field and update the corresponding cell
        //     for (const [fieldName, columnIndex] of Object.entries(
        //       fieldToColumnIndex,
        //     )) {
        //       if (dataSection.hasOwnProperty(fieldName)) {
        //         row.getCell(columnIndex).value = dataSection[fieldName];
        //       }
        //     }
        //   } else {
        //     console.warn(
        //       `No data found for placeholder '${placeholderValue}' at row ${rowNumber}`,
        //     );
        //   }
        // }
      });

      // Save the modified workbook
      const buffer = await workbook.xlsx.writeBuffer();
      console.log("Workbook has been generated successfully");
      return buffer;
    } catch (error) {
      console.error("Error reading or writing Excel file:", error);
    }
  }

  private static async queryDbForInventoryValueAndAvtivityValue(
    inventoryId: string,
  ) {
    return await db.models.InventoryValue.findAll({
      where: {
        inventoryId: inventoryId,
      },
      include: [
        { model: db.models.Inventory, as: "inventory" },
        {
          model: db.models.ActivityValue,
          as: "activityValues",
        },
      ],
    });
  }

  private static transformDataForTemplate(
    inventoryValues: InventoryValueWithActivityValues[],
  ): Record<string, any> {
    const dataDictionary: Record<string, any> = {};
    inventoryValues.forEach((inventoryValue) => {
      const gpcRefNo = inventoryValue.gpcReferenceNumber;
      const activityValues = inventoryValue.activityValues || [];
      // const activityValue = activityValues[0]; // Assuming one-to-one for simplicity
      //
      // if (!activityValue) {
      //   console.warn(`No ActivityValue associated with InventoryValue ID ${inventoryValue.id}`);
      //   return;
      // }
      //
      // const gasValues = activityValue.gasValues || [];
      // const efValues = gasValues.reduce((acc: Record<string, any>, gasValue: any) => {
      //   acc[`ef_${gasValue.gasType.toLowerCase()}_amount`] = gasValue.amount;
      //   return acc;
      // }, {});

      dataDictionary[gpcRefNo as string] = {
        // InventoryValue fields
        inventory_year: inventoryValue.inventory.year,
        gpc_reference_number: inventoryValue.gpcReferenceNumber,
        notation_key: inventoryValue.unavailableReason,
        input_methodology: inventoryValue.inputMethodology,
        // ActivityValue fields
        // activity_amount: activityValue?.activityData?.amount,
        // activity_unit: activityValue?.activityData?.unit,
        // activity_methodology_description: activityValue?.activityData?.methodology_description,
        // activity_source: activityValue?.dataSource?.name,
        // activity_quality: activityValue?.metadata?.quality,
        // // Emission factors
        // ef_unit: gasValues[0]?.unit || '',
        // ...efValues,
        // ef_description: activityValue?.dataSource?.description,
        // ef_source: activityValue?.dataSource?.source,
        // GHGs
        total_co2e: inventoryValue.co2eq,
        // Additional fields as needed
      };
    });
    return dataDictionary;
  }

  private static replacePlaceholdersInRow(
    row: Excel.Row,
    dataSection: Record<string, any>,
    rowNumber: number,
  ) {
    row.eachCell((cell, colNumber) => {
      // things left to make this work. if the data isn't found, it should be replaced with an empty string
      // dealing with Notation keys
      if (cell.value && typeof cell.value === "string") {
        const cellValue = cell.value as string;
        const placeholderMatch = cellValue.match(/{{(.*?)}}/);
        if (placeholderMatch) {
          const fieldName = placeholderMatch[1];
          const replacementValue = dataSection[fieldName];

          if (replacementValue !== undefined) {
            cell.value = replacementValue;
          } else {
            console.warn(
              `No data found for field '${fieldName}' at row ${rowNumber}, column ${colNumber}`,
            );
          }
        }
      }
    });
  }
}
