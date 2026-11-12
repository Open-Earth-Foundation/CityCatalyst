import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "@jest/globals";
import {
  cirisMissingEcrf3,
  cirisSheetsToParse,
  extractCirisWorkbookTotalTonnes,
  isCirisIgnorableHeader,
  isCirisSheetList,
  listSpreadsheetSheetNames,
} from "@/backend/ciris-workbook";
import FileParserService from "@/backend/FileParserService";
import FileValidatorService from "@/backend/FileValidatorService";
import { classifyBulkInventoryFile } from "@/backend/InventoryFileAutoImportService";
import { detectCoarseFileKind } from "@/backend/ingest/coarse-kind";
import { shouldCommitViaGhgiRunner } from "@/backend/ingest/ghgi-run";
import { fileTypeOf } from "@/backend/InventoryFileAutoImportService";

const FIXTURES = path.join(process.cwd(), "tests", "fixtures");
const DOWNLOADS = path.join(os.homedir(), "Downloads");

function fixture(name: string): string {
  return path.join(FIXTURES, name);
}

function downloads(name: string): string | null {
  const full = path.join(DOWNLOADS, name);
  return fs.existsSync(full) ? full : null;
}

describe("CC-1217 CIRIS Path A helpers", () => {
  it("maps xlsm uploads to xlsx coarse kind and fileType", () => {
    expect(detectCoarseFileKind("Boston.xlsm")).toBe("xlsx");
    expect(fileTypeOf("Boston.xlsm")).toBe("xlsx");
    expect(FileValidatorService.validateFileType(
      new File([new Uint8Array([1])], "Boston.xlsm"),
    )).toBe("xlsx");
  });

  it("ignores CIRIS-only eCRF_3 headers", () => {
    expect(isCirisIgnorableHeader("EF ID")).toBe(true);
    expect(isCirisIgnorableHeader("AD - Amount")).toBe(true);
    expect(isCirisIgnorableHeader("GPC ref. no.")).toBe(false);
  });

  it("classifies CIRIS with eCRF columns as ecrf for bulk/plugin", () => {
    const classified = classifyBulkInventoryFile({
      isValid: true,
      errors: [],
      warnings: [],
      fileType: "xlsx",
      isCIRIS: true,
      detectedColumns: { gpcRefNo: 0, sector: 1, subsector: 2, scope: 3 },
    });
    expect(classified).toEqual({ kind: "ecrf", detectedType: "ecrf" });
    expect(
      shouldCommitViaGhgiRunner({
        fileType: "xlsx",
        validationResults: { isCIRIS: true },
      }),
    ).toBe(true);
  });

  it("rejects CIRIS-like packs without eCRF_3", () => {
    expect(cirisMissingEcrf3(["CIRIS", "CDP", "I - Stationary"])).toBe(true);
    expect(cirisMissingEcrf3(["eCRF_3", "Report", "CIRIS"])).toBe(false);
  });

  it("selectively parses Boston CIRIS slim to eCRF_3", async () => {
    const buffer = fs.readFileSync(fixture("A3-04_Boston_2023_CIRIS_slim.xlsx"));
    const names = await listSpreadsheetSheetNames(buffer);
    expect(isCirisSheetList(names) || names.some((n) => /ecrf_3/i.test(n))).toBe(
      true,
    );
    const parsed = await FileParserService.parseXLSX(buffer);
    expect(parsed.primarySheet?.name).toMatch(/^eCRF_3$/i);
    expect(parsed.sheets.every((s) => !/^Light_eCRF/i.test(s.name))).toBe(true);
    expect(parsed.primarySheet?.headers.length ?? 0).toBeGreaterThan(20);
  }, 60000);

  it("parses Nairobi CIRIS slim eCRF_3 without forcing Light sheet", async () => {
    const buffer = fs.readFileSync(fixture("A3-05_Nairobi_2023_CIRIS_slim.xlsx"));
    const parsed = await FileParserService.parseXLSX(buffer);
    expect(parsed.primarySheet?.name).toMatch(/^eCRF_3$/i);
  }, 60000);
});

describe("CC-1217 full CIRIS workbooks (local Downloads)", () => {
  const boston = downloads("Boston, USA 2023 Final CIRIS (2025).xlsm");
  const buenos = downloads("CIRIS_BuenosAires_GEI_2020_CDP.xlsx");

  it("filters full Boston xlsm to eCRF_3 + Report/Overview", async () => {
    if (!boston) return;
    const buffer = fs.readFileSync(boston);
    const names = await listSpreadsheetSheetNames(buffer);
    expect(names.length).toBeGreaterThan(40);
    expect(isCirisSheetList(names)).toBe(true);
    expect(cirisSheetsToParse(names)).toEqual(
      expect.arrayContaining(["eCRF_3", "Report"]),
    );
    const parsed = await FileParserService.parseXLSX(buffer);
    expect(parsed.isCIRIS).toBe(true);
    expect(parsed.sheets.map((s) => s.name)).toEqual(
      expect.arrayContaining(["eCRF_3", "Report"]),
    );
    expect(parsed.sheets.length).toBeLessThanOrEqual(5);
    expect(parsed.primarySheet?.name).toBe("eCRF_3");
    const total = extractCirisWorkbookTotalTonnes(parsed.sheets);
    expect(total).toBeGreaterThan(5_000_000);
    expect(Math.round(total!)).toBe(5_555_289);
  }, 120000);

  it("detects Buenos Aires CIRIS and keeps eCRF_3", async () => {
    if (!buenos) return;
    const buffer = fs.readFileSync(buenos);
    const names = await listSpreadsheetSheetNames(buffer);
    expect(isCirisSheetList(names)).toBe(true);
    const parsed = await FileParserService.parseXLSX(buffer);
    expect(parsed.isCIRIS).toBe(true);
    expect(parsed.primarySheet?.name).toMatch(/^eCRF_3$/i);
    expect(parsed.sheets.length).toBeLessThanOrEqual(5);
  }, 120000);
});
