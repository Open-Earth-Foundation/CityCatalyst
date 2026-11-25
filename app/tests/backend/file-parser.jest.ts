import { describe, expect, it } from "@jest/globals";
import Excel from "exceljs";
import FileParserService from "@/backend/FileParserService";

describe("FileParserService.parseXLSX", () => {
  it("keeps blank data rows so file row counts match the sheet", async () => {
    const workbook = new Excel.Workbook();
    const sheet = workbook.addWorksheet("eCRF_3");
    sheet.getCell("A1").value = "GPC ref. no.";
    sheet.getCell("B1").value = "Total CO2e";
    sheet.getCell("A2").value = "I.1.1";
    sheet.getCell("B2").value = 10;
    sheet.getCell("A4").value = "I.1.2";
    sheet.getCell("B4").value = 5;

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await FileParserService.parseXLSX(buffer);
    const primary = parsed.primarySheet;

    expect(primary?.rows).toHaveLength(3);
    expect(primary?.rowNumbers).toEqual([2, 3, 4]);
    expect(primary?.rows[1]).toEqual({
      "GPC ref. no.": null,
      "Total CO2e": null,
    });
  });
});
