import { afterEach, describe, expect, it, jest } from "@jest/globals";
import ECRFImportService, {
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
});
