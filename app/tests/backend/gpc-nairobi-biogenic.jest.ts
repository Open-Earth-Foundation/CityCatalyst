/**
 * CC-1201: biogenic CO2 is reported apart and never counted in totals (GPC 4.2.2).
 * Real file: Nairobi 2023 eCRF_3 has ~503,000 t of CO2(b) and a known total of
 * 8,079,322 t. Excluding III.x.3 and VI.1 from totals must not change either.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, jest } from "@jest/globals";

jest.unstable_mockModule("@/models", () => ({
  db: { models: { Scope: { findAll: async () => [] } } },
}));

const { default: FileParserService } =
  await import("@/backend/FileParserService");
const { default: ECRFImportService } =
  await import("@/backend/ECRFImportService");
const { resolveImportedTotalCO2e } =
  await import("@/backend/InventoryImportService");
const { previewImportRows } = await import("@/backend/ImportRowPreviewService");

const KNOWN_TOTAL = 8079322;
const KNOWN_BIOGENIC = 503386;

describe("Nairobi 2023 eCRF_3", () => {
  it("keeps CO2(b) out of the imported total", async () => {
    jest.spyOn(ECRFImportService, "lookupGPCReference").mockResolvedValue({
      sectorId: "sector",
      subsectorId: "subsector",
      subcategoryId: "subcategory",
      scopeId: "scope",
    } as Awaited<ReturnType<typeof ECRFImportService.lookupGPCReference>>);

    const buffer = readFileSync(
      path.join(
        process.cwd(),
        "tests/fixtures/A3-05_Nairobi_2023_eCRF_only.xlsx",
      ),
    );
    const parsed = await FileParserService.parseXLSX(buffer);
    const sheet = parsed.sheets.find((s) => s.name === "eCRF_3");
    expect(sheet).toBeDefined();
    const indexOf = (header: string) => sheet!.headers.indexOf(header);
    const result = await ECRFImportService.processECRFFile(
      { ...parsed, primarySheet: sheet },
      {
        gpcRefNo: indexOf("GPC ref. no."),
        sector: indexOf("CRF - Sector"),
        subsector: indexOf("CRF - Sub-sector"),
        scope: indexOf("Scope"),
        notationKey: indexOf("Notation key"),
        year: indexOf("Inventory year"),
        co2: indexOf("GHGs (metric tonnes CO2e) - CO2"),
        ch4: indexOf("GHGs (metric tonnes CO2e) - CH4"),
        n2o: indexOf("GHGs (metric tonnes CO2e) - N2O"),
        totalCO2e: indexOf("GHGs (metric tonnes CO2e) - Total CO2e"),
      },
    );

    const imported = result.rows.filter((row) => !row.errors?.length);
    const total = imported.reduce(
      (sum, row) => sum + (resolveImportedTotalCO2e(row) ?? 0),
      0,
    );
    expect(Math.round(total)).toBe(KNOWN_TOTAL);
    // The biogenic column is not read as an emission value.
    expect(Math.round(total + KNOWN_BIOGENIC)).not.toBe(KNOWN_TOTAL);

    const preview = await previewImportRows(result, undefined);
    expect(preview.omittedFromTotalTonnes).toBe(0);
  });
});
