import Excel from "exceljs";

const fakeDictionary: Record<string, any> = {
  "I.1.1": {
    activity_amount: 1,
    activity_unit: "kg",
    activity_methodology_description: "Methodology 1",
    activity_source: "Source 1",
    activity_quality: "Quality 1", // when more than one exists, use the most common
    ef_unit: "kg/m3",
    ef_co2_amount: 1,
    ef_n2o_amount: 1,
    ef_ch4_amount: 1,
    ef_description: "Description 1",
    ef_source: "Source 1",
    ghg_tonnes_co2: 2000,
  },
  "I.2.1": {
    activity_amount: 2,
    activity_unit: "kg",
    activity_methodology_description: "Methodology 2",
    activity_source: "Source 2",
    activity_quality: "Quality 2", // when more than one exists, use the most common
    ef_unit: "kg/m3",
    ef_co2_amount: 2,
    ef_n2o_amount: 2,
    ef_ch4_amount: 2,
    ef_description: "Description 2",
    ef_source: "Source 2",
    ghg_tonnes_co2: 4000,
  },
};

const ECRF_TEMPLATE_PATH = "./templates/eCRF_Export_template.xlsx";

export default class ECRFDownloadService {
  public static async downloadECRF() {
    // ideally what we wanna do is stream to aws s3 and return the url or find a way to cache this.
    console.time("save_ciris");
    const buffer = new Buffer("This is a dummy buffer");
    console.timeEnd("save_ciris");
    return buffer;
  }

  private static async writeTOECRFFILE() {
    const workbook = new Excel.Workbook();

    try {
      // Load the workbook
      await workbook.xlsx.readFile(ECRF_TEMPLATE_PATH);
      const worksheet = workbook.getWorksheet(3); // Get the worksheet by index (3rd sheet)

      // Map field names to column indices
      const fieldToColumnIndex: Record<string, number> = {
        activity_amount: 3,
        activity_unit: 4,
        activity_methodology_description: 5,
        activity_source: 6,
        activity_quality: 7,
        ef_unit: 8,
        ef_co2_amount: 9,
        ef_n2o_amount: 10,
        ef_ch4_amount: 11,
        ef_description: 12,
        ef_source: 13,
        ghg_tonnes_co2: 14,
      };

      // Iterate over all rows to find and replace placeholders
      worksheet?.eachRow((row, rowNumber) => {
        const placeholderCell = row.getCell(2);
        const placeholderValue = placeholderCell.value;

        if (placeholderValue && typeof placeholderValue === "string") {
          const dataSection = fakeDictionary[placeholderValue];

          if (dataSection) {
            // Loop through each field and update the corresponding cell
            for (const [fieldName, columnIndex] of Object.entries(
              fieldToColumnIndex,
            )) {
              if (dataSection.hasOwnProperty(fieldName)) {
                row.getCell(columnIndex).value = dataSection[fieldName];
              }
            }
          } else {
            console.warn(
              `No data found for placeholder '${placeholderValue}' at row ${rowNumber}`,
            );
          }
        }
      });

      // Save the modified workbook
      await workbook.xlsx.writeFile("output.xlsx");
      console.log("Workbook has been written successfully to output.xlsx");
    } catch (error) {
      console.error("Error reading or writing Excel file:", error);
    }
  }
}
