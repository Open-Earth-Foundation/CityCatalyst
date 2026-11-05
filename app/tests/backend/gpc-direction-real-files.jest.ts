/**
 * CC-1201: the III.x.3 to III.x.2 correction must leave real files alone.
 * Inputs are files that ship with the repo: the official eCRF and CIRIS
 * templates (declared codes, official labels) and the Nairobi 2023 eCRF.
 * None of them holds a model-extracted PDF, so this covers declared references
 * and official names, not the extraction path.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it, jest } from "@jest/globals";

jest.unstable_mockModule("@/models", () => ({
  db: { models: { Scope: { findAll: async () => [] } } },
}));

const { default: FileParserService } =
  await import("@/backend/FileParserService");
const { correctWasteDirection } = await import("@/util/GHGI/gpc-ref-resolver");

const WASTE_REF = /^III\.[1-4]\.[1-3]$/;

function appFile(relative: string): Buffer {
  return readFileSync(path.join(process.cwd(), relative));
}

type RealRow = { ref: string; scope: string; label: string };

async function eCrfRows(relative: string): Promise<RealRow[]> {
  const parsed = await FileParserService.parseXLSX(appFile(relative));
  const sheet = parsed.sheets.find((s) => s.name === "eCRF_3")!;
  return sheet.rows
    .map((row) => ({
      ref: String(row["GPC ref. no."] ?? "").trim(),
      scope: String(row["Scope"] ?? ""),
      label: String(row["CRF - Sub-sector"] ?? ""),
    }))
    .filter((row) => WASTE_REF.test(row.ref));
}

// CIRIS_template.xlsm is about 8 MB. ExcelJS takes longer than Jest's 5s
// default when the full suite is running, so parse it once and share it.
let cirisRowsPromise: Promise<RealRow[]> | undefined;

function cirisReportRows(): Promise<RealRow[]> {
  cirisRowsPromise ??= loadCirisReportRows();
  return cirisRowsPromise;
}

async function loadCirisReportRows(): Promise<RealRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    appFile("templates/CIRIS_template.xlsm") as unknown as Parameters<
      typeof workbook.xlsx.load
    >[0],
  );
  const sheet = workbook.getWorksheet("Report")!;
  const rows: RealRow[] = [];
  sheet.eachRow((row) => {
    const cells = (row.values as unknown[])
      .slice(1)
      .map((value) =>
        value && typeof value === "object" && "result" in value
          ? (value as { result: unknown }).result
          : value,
      )
      .filter((value) => value != null && value !== "");
    const ref = String(cells[0] ?? "").trim();
    if (WASTE_REF.test(ref)) {
      rows.push({
        ref,
        scope: String(cells[1] ?? ""),
        label: String(cells[2] ?? "").trim(),
      });
    }
  });
  return rows;
}

describe("waste direction on real files", () => {
  it("keeps every declared reference in the official eCRF template", async () => {
    const rows = await eCrfRows("templates/ecrf_template.xlsx");
    expect(rows.map((row) => row.ref).sort()).toEqual(
      [1, 2, 3, 4].flatMap((n) => [1, 2, 3].map((k) => `III.${n}.${k}`)).sort(),
    );
    for (const row of rows) {
      // The template marks .2 as outside the city and .3 as direct emissions.
      expect(correctWasteDirection(row.ref, [row.label], row.scope)).toBe(
        row.ref,
      );
    }
  });

  it("keeps every reference in the Nairobi 2023 eCRF", async () => {
    const rows = await eCrfRows(
      "tests/fixtures/A3-05_Nairobi_2023_eCRF_only.xlsx",
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(correctWasteDirection(row.ref, [row.label], row.scope)).toBe(
        row.ref,
      );
    }
  });

  it("keeps every reference under its official CIRIS name", async () => {
    const rows = await cirisReportRows();
    expect(rows.map((row) => row.ref).sort()).toEqual(
      [1, 2, 3, 4].flatMap((n) => [1, 2, 3].map((k) => `III.${n}.${k}`)).sort(),
    );
    for (const row of rows) {
      // CIRIS lists .2 as scope 3 and .3 as scope 1.
      expect(correctWasteDirection(row.ref, [row.label], row.scope)).toBe(
        row.ref,
      );
    }
  }, 60_000);

  it("corrects a .3 that carries the official .2 name or scope 3", async () => {
    const rows = await cirisReportRows();
    for (const row of rows.filter((r) => r.ref.endsWith(".2"))) {
      const wrong = row.ref.replace(/\.2$/, ".3");
      expect(correctWasteDirection(wrong, [row.label], "1")).toBe(row.ref);
      expect(correctWasteDirection(wrong, [], "3")).toBe(row.ref);
    }
  }, 60_000);

  it("never creates a .3 and never moves a .3 on a .1 name or scope 1", async () => {
    const rows = await cirisReportRows();
    for (const row of rows.filter((r) => r.ref.endsWith(".1"))) {
      const wrong = row.ref.replace(/\.1$/, ".3");
      expect(correctWasteDirection(wrong, [row.label], "1")).toBe(wrong);
    }
    for (const row of rows.filter((r) => !r.ref.endsWith(".3"))) {
      expect(correctWasteDirection(row.ref, [row.label], "3")).toBe(row.ref);
    }
  }, 60_000);

  it("leaves the Auckland OCR excerpt references alone", () => {
    const text = readFileSync(
      path.join(process.cwd(), "tests/fixtures/auckland-2021-ocr-excerpt.md"),
      "utf-8",
    );
    const refs = [...text.matchAll(/\bIII\.[1-4]\.[\d/]+/g)].map((m) => m[0]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(
        correctWasteDirection(ref, ["Solid waste generated in the city"], "1"),
      ).toBe(ref);
    }
  });
});
