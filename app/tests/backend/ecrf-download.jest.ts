/**
 * @jest-environment node
 *
 * CC-1017: eCRF export must not 500 on eCRF-imported inventories
 * (empty activity gasValues, missing emissions factors).
 */
import { describe, expect, it } from "@jest/globals";
import Excel from "exceljs";
import ECRFDownloadService from "@/backend/ECRFDownloadService";
import type { InventoryWithInventoryValuesAndActivityValues } from "@/util/types";

function baseInventory(
  activityValues: Record<string, unknown>[],
): InventoryWithInventoryValuesAndActivityValues {
  return {
    inventoryId: "inv-1",
    year: 2016,
    inventoryType: "gpc_basic",
    city: {
      cityId: "city-1",
      name: "Mexico City",
      locode: "MX MEX",
      country: "Mexico",
      region: "CDMX",
    },
    inventoryValues: [
      {
        id: "iv-1",
        gpcReferenceNumber: "I.1.1",
        co2eq: 1000000n,
        inputMethodology: "direct-measure",
        dataSource: null,
        unavailableReason: null,
        activityValues,
      },
    ],
  } as unknown as InventoryWithInventoryValuesAndActivityValues;
}

describe("ECRFDownloadService.downloadECRF (CC-1017)", () => {
  it("exports when activity has empty gasValues (eCRF import shape)", async () => {
    const buffer = await ECRFDownloadService.downloadECRF(
      baseInventory([
        {
          co2eq: 1000000n,
          activityData: {
            "activity-value": 10,
            "activity-value-unit": "units-tonnes",
            co2_amount: 900,
            ch4_amount: 1,
            n2o_amount: 0.5,
            "data-source": "eCRF import",
          },
          metadata: {
            activityTitle: "activity-value",
            dataQuality: "low",
          },
          gasValues: [],
        },
      ]),
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("exports when GasValue has amount but no emissionsFactor", async () => {
    const buffer = await ECRFDownloadService.downloadECRF(
      baseInventory([
        {
          co2eq: 500000n,
          activityData: { "activity-value": 1 },
          metadata: { activityTitle: "activity-value", dataQuality: "low" },
          gasValues: [
            { gas: "CO2", gasAmount: 400000n, emissionsFactor: null },
            { gas: "CH4", gasAmount: 1000n, emissionsFactor: null },
          ],
        },
      ]),
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("writes the inventory year on eCRF_3 and English template text (CC-1153)", async () => {
    const buffer = await ECRFDownloadService.downloadECRF(
      {
        ...baseInventory([]),
        inventoryValues: [
          {
            id: "iv-ne",
            gpcReferenceNumber: "I.1.1",
            co2eq: 0n,
            inputMethodology: "direct-measure",
            dataSource: null,
            unavailableReason: "no-occurrance",
            unavailableExplanation: "not occurring",
            activityValues: [],
          },
        ],
      } as unknown as InventoryWithInventoryValuesAndActivityValues,
    );

    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const sheet2 = workbook.getWorksheet(2);
    const sheet3 = workbook.getWorksheet(3);
    expect(sheet2).toBeDefined();
    expect(sheet3).toBeDefined();

    const sheet2Text: string[] = [];
    sheet2?.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === "string") sheet2Text.push(cell.value);
      });
    });
    expect(sheet2Text.join(" ")).toContain(
      "Institutional emissions are included in commercial emissions record",
    );
    expect(sheet2Text.join(" ")).not.toContain(
      "Las emisiones institucionales están incluidas",
    );

    const i11 = sheet3?.getRow(2);
    expect(i11?.getCell(2).value).toBe("I.1.1");
    expect(i11?.getCell(1).value).toBe(2016);
    expect(i11?.getCell(1).value).not.toBe("Please select");
  });

  it("does not write a numeric value on a notation-key eCRF_3 row (CC-1153)", async () => {
    const buffer = await ECRFDownloadService.downloadECRF(
      {
        ...baseInventory([]),
        inventoryValues: [
          {
            id: "iv-ne",
            gpcReferenceNumber: "I.1.1",
            co2eq: 0n,
            inputMethodology: "direct-measure",
            dataSource: null,
            unavailableReason: "not-estimated",
            activityValues: [],
          },
        ],
      } as unknown as InventoryWithInventoryValuesAndActivityValues,
    );

    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const sheet3 = workbook.getWorksheet(3);
    const i11 = sheet3?.getRow(2);
    expect(i11?.getCell(2).value).toBe("I.1.1");
    expect(i11?.getCell(7).value).toBe("NE");
    expect(i11?.getCell(28).value).toBe("");
  });

  it("writes CIRIS notation justification on eCRF_3 (CC-1329)", async () => {
    const buffer = await ECRFDownloadService.downloadECRF(
      {
        ...baseInventory([]),
        inventoryValues: [
          {
            id: "iv-ii53",
            gpcReferenceNumber: "II.5.3",
            co2eq: 0n,
            inputMethodology: "direct-measure",
            dataSource: null,
            unavailableReason: "not-estimated",
            unavailableExplanation: "not required for BASIC",
            activityValues: [],
          },
        ],
      } as unknown as InventoryWithInventoryValuesAndActivityValues,
    );

    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const sheet3 = workbook.getWorksheet(3);
    let found: Excel.Row | undefined;
    sheet3?.eachRow((row) => {
      if (row.getCell(2).value === "II.5.3") found = row;
    });
    expect(found?.getCell(7).value).toBe("NE");
    expect(String(found?.getCell(10).value ?? "")).toContain(
      "not required for BASIC",
    );
  });

  it("does not invent NE for GPC refs the inventory never reported (CC-1153)", async () => {
    const buffer = await ECRFDownloadService.downloadECRF(baseInventory([]));
    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );

    const sheet3 = workbook.getWorksheet(3);
    let i12Notation: Excel.CellValue | undefined;
    sheet3?.eachRow((row) => {
      if (row.getCell(2).value === "I.1.2") {
        i12Notation = row.getCell(7).value;
      }
    });
    expect(i12Notation).not.toBe("NE");
    expect(i12Notation).not.toMatch(/\{\{/);
  });

  function sheet3RowByGpc(sheet: Excel.Worksheet | undefined, gpc: string) {
    let found: Excel.Row | undefined;
    sheet?.eachRow((row) => {
      if (row.getCell(2).value === gpc) found = row;
    });
    return found;
  }

  it("writes eCRF/CIRIS gas amounts as tCO2e without applying GWP (CC-1329)", async () => {
    const buffer = await ECRFDownloadService.downloadECRF(
      baseInventory([
        {
          co2eq: 1000000n,
          activityData: {
            "activity-value": 10,
            co2_amount: 900,
            ch4_amount: 1,
            n2o_amount: 5069,
          },
          metadata: {
            activityTitle: "activity-value",
            dataQuality: "low",
            ecrfActivityType: "Natural gas",
            ecrfMethodology: "Fuel sales survey",
            emissionFactorUnit: "tCO2e/Therm",
            emissionFactorCO2: 69.3,
          },
          gasValues: [
            { gas: "N2O", gasAmount: 5_069_000n, emissionsFactor: null },
          ],
        },
      ]),
    );

    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const row = sheet3RowByGpc(workbook.getWorksheet(3), "I.1.1");
    expect(row?.getCell(25).value).toBe(900);
    expect(row?.getCell(26).value).toBe(1);
    expect(row?.getCell(27).value).toBe(5069);
    expect(row?.getCell(27).value).not.toBe(5069 * 265);
    expect(row?.getCell(6).value).toBe("Natural gas");
    expect(row?.getCell(10).value).toBe("Fuel sales survey");
    expect(row?.getCell(13).value).toBe("tCO2e/Therm");
    expect(row?.getCell(14).value).toBe(69.3);
  });

  it("still applies AR5 GWP when only native GasValue kg amounts exist", async () => {
    const buffer = await ECRFDownloadService.downloadECRF(
      baseInventory([
        {
          co2eq: 500000n,
          activityData: { "activity-value": 1 },
          metadata: { activityTitle: "activity-value", dataQuality: "low" },
          gasValues: [
            { gas: "CH4", gasAmount: 1000n, emissionsFactor: null },
            { gas: "N2O", gasAmount: 1000n, emissionsFactor: null },
          ],
        },
      ]),
    );

    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const row = sheet3RowByGpc(workbook.getWorksheet(3), "I.1.1");
    expect(row?.getCell(26).value).toBe(28);
    expect(row?.getCell(27).value).toBe(265);
  });
});
