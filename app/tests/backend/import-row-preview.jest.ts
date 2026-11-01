import { afterEach, describe, expect, it, jest } from "@jest/globals";
import ECRFImportService, {
  countRowsSkippedEmptyEmissions,
  type ECRFImportResult,
  type ECRFRowData,
} from "@/backend/ECRFImportService";
import { importRowSkipReason } from "@/backend/InventoryImportService";
import InventoryProgressService from "@/backend/InventoryProgressService";
import { previewImportRows } from "@/backend/ImportRowPreviewService";
import type { Sector } from "@/models/Sector";
import { InventoryTypeEnum } from "@/util/enums";

const STRUCTURE = [
  {
    sectorId: "sector-I",
    referenceNumber: "I",
    subSectors: [
      {
        referenceNumber: "I.1",
        subCategories: [
          { referenceNumber: "I.1.1", scope: { scopeName: "1" } },
          { referenceNumber: "I.1.2", scope: { scopeName: "2" } },
          { referenceNumber: "I.1.3", scope: { scopeName: "3" } },
        ],
      },
    ],
  },
] as unknown as Sector[];

function row(rowIndex: number, fields: Partial<ECRFRowData> = {}): ECRFRowData {
  return {
    gpcRefNo: "I.1.1",
    sectorId: "sector-I",
    subsectorId: "subsector-I.1",
    subcategoryId: "subcategory-I.1.1",
    scopeId: "scope-1",
    rowIndex,
    sourceRowNumber: rowIndex + 2,
    ...fields,
  };
}

function importResult(rows: ECRFRowData[]): ECRFImportResult {
  return {
    rows,
    errors: [],
    warnings: [],
    rowCount: rows.length,
    validRowCount: rows.filter((r) => !r.errors?.length).length,
    rowsSkippedEmptyEmissions: countRowsSkippedEmptyEmissions(rows),
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("importRowSkipReason", () => {
  it("imports rows with emissions, even when a notation key is also present", () => {
    expect(importRowSkipReason(row(0, { totalCO2e: 12 }))).toBeNull();
    expect(importRowSkipReason(row(0, { co2: 3, ch4: 1 }))).toBeNull();
    expect(importRowSkipReason(row(0, { totalCO2e: -4 }))).toBeNull();
    expect(
      importRowSkipReason(row(0, { totalCO2e: 5, notationKey: "XX" })),
    ).toBeNull();
  });

  it("imports rows with a known notation key", () => {
    expect(importRowSkipReason(row(0, { notationKey: "IE" }))).toBeNull();
    expect(importRowSkipReason(row(0, { notationKey: "no" }))).toBeNull();
    expect(
      importRowSkipReason(row(0, { notationKey: "Not Occuring" })),
    ).toBeNull();
    expect(
      importRowSkipReason(row(0, { notationKey: "Not Estimated" })),
    ).toBeNull();
  });

  it("skips rows with an unknown notation key or no data at all", () => {
    expect(importRowSkipReason(row(0, { notationKey: "XX" }))).toBe(
      "unknown-notation-key",
    );
    expect(importRowSkipReason(row(0, { totalCO2e: 0 }))).toBe(
      "no-value-or-notation-key",
    );
    expect(importRowSkipReason(row(0))).toBe("no-value-or-notation-key");
  });
});

describe("previewImportRows", () => {
  it("explains every skipped and not-counted row in file order", async () => {
    jest
      .spyOn(InventoryProgressService, "getSortedInventoryStructure")
      .mockResolvedValue(STRUCTURE);

    const preview = await previewImportRows(
      importResult([
        row(0, { totalCO2e: 10 }),
        row(1, { gpcRefNo: "I.1.3", totalCO2e: 2 }),
        row(2, {
          gpcRefNo: "",
          issue: "missing-gpc-reference",
          errors: ["No GPC reference number found"],
        }),
        row(3, {
          gpcRefNo: "",
          sourceLabel: "Energy / Mystery",
          issue: "gpc-reference-unresolved",
          errors: ["Could not resolve"],
        }),
        row(4, {
          gpcRefNo: "I.9.9",
          issue: "gpc-reference-unknown",
          errors: ["not found"],
        }),
        row(5, { notationKey: "XX" }),
        row(6),
        row(7, { errors: ["legacy error without a code"] }),
      ]),
      InventoryTypeEnum.GPC_BASIC,
    );

    expect(preview).toMatchObject({
      totalRows: 8,
      importedRows: 2,
      skippedRows: 6,
      skippedByIssue: {
        "missing-gpc-reference": 1,
        "gpc-reference-unresolved": 1,
        "gpc-reference-unknown": 1,
        "unknown-notation-key": 1,
        "no-value-or-notation-key": 1,
        "invalid-row": 1,
      },
    });
    expect(
      preview.rows.map(({ rowNumber, gpcRefNo, status, issue }) => [
        rowNumber,
        gpcRefNo,
        status,
        issue,
      ]),
    ).toEqual([
      [3, "I.1.3", "not-counted", "outside-inventory-type"],
      [4, null, "skipped", "missing-gpc-reference"],
      [5, null, "skipped", "gpc-reference-unresolved"],
      [6, "I.9.9", "skipped", "gpc-reference-unknown"],
      [7, "I.1.1", "skipped", "unknown-notation-key"],
      [8, "I.1.1", "skipped", "no-value-or-notation-key"],
      [9, "I.1.1", "skipped", "invalid-row"],
    ]);
    expect(preview.rows[2].sourceLabel).toBe("Energy / Mystery");
    expect(preview.rows[4].notationKey).toBe("XX");
  });

  it("counts every imported row for GPC BASIC+", async () => {
    jest
      .spyOn(InventoryProgressService, "getSortedInventoryStructure")
      .mockResolvedValue(STRUCTURE);

    const preview = await previewImportRows(
      importResult([row(0, { gpcRefNo: "I.1.3", totalCO2e: 2 })]),
      InventoryTypeEnum.GPC_BASIC_PLUS,
    );

    expect(preview).toMatchObject({ importedRows: 1, rows: [] });
  });

  it("falls back to the extracted row position when there is no file row number", async () => {
    jest
      .spyOn(InventoryProgressService, "getSortedInventoryStructure")
      .mockResolvedValue(STRUCTURE);

    const preview = await previewImportRows(
      importResult([row(4, { sourceRowNumber: undefined })]),
      InventoryTypeEnum.GPC_BASIC,
    );

    expect(preview.rows[0].rowNumber).toBe(5);
  });
});

describe("ECRFImportService.processECRFFile", () => {
  it("reads activity_name as fuel and ignores gas columns as emission factors", async () => {
    jest.spyOn(ECRFImportService, "lookupGPCReference").mockResolvedValue({
      sectorId: "sector-I",
      subsectorId: "subsector-I.1",
      subcategoryId: "subcategory-I.1.1",
      scopeId: "scope-1",
    } as Awaited<ReturnType<typeof ECRFImportService.lookupGPCReference>>);

    const headers = [
      "gpc_ref_no",
      "sector",
      "subsector",
      "activity_name",
      "activity_amount",
      "scope",
      "co2",
      "ch4",
      "n2o",
      "total_co2e",
      "year",
    ];
    const result = await ECRFImportService.processECRFFile(
      {
        fileType: "xlsx",
        sheets: [],
        primarySheet: {
          name: "Sheet1",
          headers,
          rows: [
            {
              gpc_ref_no: "I.1.1",
              sector: "Stationary Energy",
              subsector: "Residential",
              activity_name: "Gas natural",
              activity_amount: 10,
              scope: "1",
              co2: 6139026,
              ch4: 1,
              n2o: 2,
              total_co2e: 100,
              year: 2020,
            },
            {
              gpc_ref_no: "I.1.2",
              sector: "Stationary Energy",
              subsector: "Residential",
              activity_name: "Not Occuring",
              activity_amount: null,
              scope: "1",
              co2: null,
              ch4: null,
              n2o: null,
              total_co2e: null,
              year: 2020,
            },
          ],
          rowCount: 3,
          columnCount: headers.length,
        },
      },
      {
        gpcRefNo: 0,
        sector: 1,
        subsector: 2,
        activityType: 3,
        activityAmount: 4,
        scope: 5,
        co2: 6,
        ch4: 7,
        n2o: 8,
        totalCO2e: 9,
        year: 10,
        // Simulate the pre-fix bad binding so the importer still rejects it
        emissionFactorCO2: 6,
        emissionFactorCH4: 7,
        emissionFactorN2O: 8,
        emissionFactorTotalCO2e: 6,
      },
    );

    expect(result.rows[0]).toMatchObject({
      activityType: "Gas natural",
      co2: 6139026,
      emissionFactorCO2: undefined,
      emissionFactorCH4: undefined,
      emissionFactorN2O: undefined,
      emissionFactorTotalCO2e: undefined,
      notationKey: undefined,
    });
    expect(result.rows[1]).toMatchObject({
      activityType: undefined,
      notationKey: "Not Occuring",
    });
    expect(importRowSkipReason(result.rows[1])).toBeNull();
  });

  it("keeps rows without a GPC reference as rejected rows with their file row number", async () => {
    jest.spyOn(ECRFImportService, "lookupGPCReference").mockResolvedValue({
      sectorId: "sector-I",
      subsectorId: "subsector-I.1",
      subcategoryId: "subcategory-I.1.1",
      scopeId: "scope-1",
    } as Awaited<ReturnType<typeof ECRFImportService.lookupGPCReference>>);

    const result = await ECRFImportService.processECRFFile(
      {
        fileType: "xlsx",
        sheets: [],
        primarySheet: {
          name: "Inventory",
          headers: ["GPC ref. no.", "Total CO2e"],
          rows: [
            { "GPC ref. no.": "I.1.1", "Total CO2e": 10 },
            { "GPC ref. no.": null, "Total CO2e": 99 },
          ],
          rowNumbers: [2, 4],
          rowCount: 4,
          columnCount: 2,
        },
      },
      { gpcRefNo: 0, totalCO2e: 1 },
    );

    expect(result.validRowCount).toBe(1);
    expect(result.rows[0]).toMatchObject({
      gpcRefNo: "I.1.1",
      sourceRowNumber: 2,
    });
    expect(result.rows[1]).toMatchObject({
      gpcRefNo: "",
      sourceRowNumber: 4,
      issue: "missing-gpc-reference",
    });
  });

  it("counts fully blank sheet rows as skipped empty rows, not missing GPC", async () => {
    jest.spyOn(ECRFImportService, "lookupGPCReference").mockResolvedValue({
      sectorId: "sector-I",
      subsectorId: "subsector-I.1",
      subcategoryId: "subcategory-I.1.1",
      scopeId: "scope-1",
    } as Awaited<ReturnType<typeof ECRFImportService.lookupGPCReference>>);

    const result = await ECRFImportService.processECRFFile(
      {
        fileType: "xlsx",
        sheets: [],
        primarySheet: {
          name: "Inventory",
          headers: ["GPC ref. no.", "Total CO2e"],
          rows: [
            { "GPC ref. no.": "I.1.1", "Total CO2e": 10 },
            { "GPC ref. no.": null, "Total CO2e": null },
            { "GPC ref. no.": "I.1.2", "Total CO2e": 4 },
          ],
          rowNumbers: [2, 3, 4],
          rowCount: 4,
          columnCount: 2,
        },
      },
      { gpcRefNo: 0, totalCO2e: 1 },
    );

    expect(result.rowCount).toBe(3);
    expect(result.rows[1]).toMatchObject({
      sourceRowNumber: 3,
      issue: "no-value-or-notation-key",
    });
  });
});
