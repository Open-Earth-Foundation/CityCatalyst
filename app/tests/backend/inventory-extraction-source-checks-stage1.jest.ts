/**
 * CC-1163 stage 1: each line item is checked against its page text. Rows whose
 * value or unit is not confirmed are kept and marked for review, never trusted
 * silently or dropped.
 */
import { describe, expect, it, jest } from "@jest/globals";

jest.unstable_mockModule("@/backend/llm", () => ({
  createLLMClient: () => ({ complete: jest.fn() }),
  LLMError: class LLMError extends Error {},
  LLMErrorCode: { BAD_REQUEST: "BAD_REQUEST" },
}));

const { finalizeExtractedRows } =
  await import("@/backend/InventoryExtractionService");
type ExtractedRow = Parameters<typeof finalizeExtractedRows>[0][number];

const lineItem = (
  totalCO2e: number | null,
  overrides: Partial<ExtractedRow> = {},
): ExtractedRow => ({
  year: 2021,
  sector: "Transportation",
  subsector: "On-Road",
  scope: "1",
  category: null,
  gpcRefNo: "II.1.1",
  totalCO2e,
  unit: "t",
  rowType: "line_item",
  ...overrides,
});

const total = (
  totalCO2e: number,
  overrides: Partial<ExtractedRow> = {},
): ExtractedRow => ({
  year: 2021,
  sector: null,
  subsector: null,
  category: "Total",
  totalCO2e,
  unit: "t",
  rowType: "total",
  ...overrides,
});

const page = (text: string) => ({
  source: { text, kind: "page" as const },
  currentYear: 2026,
});

describe("CC-1163 stage 1: line items checked against their page", () => {
  it("flags both rows when the model returns 120 and 180 for a table of 100 and 200", () => {
    const result = finalizeExtractedRows(
      [
        lineItem(120),
        lineItem(180, { subsector: "Railways", gpcRefNo: "II.2.1" }),
        total(300),
      ],
      2021,
      page("| Road | 100 |\n| Rail | 200 |\n| Total | 300 |"),
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.valueCheck)).toEqual([
      "not_found",
      "not_found",
    ]);
    expect(result.summary.reportedTotals[0].inText).toBe(true);
  });

  it("finds a parenthesized negative and rejects the positive", () => {
    const text = "| Forestry | (811,512) |";
    const negative = finalizeExtractedRows(
      [lineItem(-811512)],
      2021,
      page(text),
    );
    expect(negative.rows[0].valueCheck).toBeUndefined();
    const positive = finalizeExtractedRows(
      [lineItem(811512)],
      2021,
      page(text),
    );
    expect(positive.rows[0].valueCheck).toBe("not_found");
  });

  it("accepts a rounded printed figure within its step", () => {
    const result = finalizeExtractedRows(
      [lineItem(12.9, { unit: "Mt" })],
      2021,
      page("| Waste | 12.9 |"),
    );
    expect(result.rows[0].valueCheck).toBeUndefined();
  });

  it("keeps notation-only rows unmarked", () => {
    const result = finalizeExtractedRows(
      [lineItem(null, { notationKey: "NE", unit: null })],
      2021,
      page("Table 4: Emissions (kt CO2e)\n| Road | NE |"),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].valueCheck).toBeUndefined();
    expect(result.rows[0].unitCheck).toBeUndefined();
  });

  it("chunk path allows exact matches only", () => {
    const source = {
      source: { text: "Total 9,559.2 kt", kind: "document" as const },
    };
    const totals = finalizeExtractedRows([total(9559215)], 2021, source);
    expect(totals.summary.reportedTotals[0].inText).toBe(false);
    const items = finalizeExtractedRows(
      [lineItem(9559.2, { unit: "kt" })],
      2021,
      source,
    );
    expect(items.rows[0].valueCheck).toBeUndefined();
    expect(items.rows[0].totalCO2e).toBe(9559200);
  });

  it("records page and onTableLine on reported totals", () => {
    const result = finalizeExtractedRows(
      [lineItem(100, { page: 7 }), total(300, { page: 7 })],
      2021,
      page("Total emissions were 300 t.\n| Total | 300 |"),
    );
    expect(result.summary.reportedTotals[0]).toMatchObject({
      page: 7,
      onTableLine: true,
    });
    const prose = finalizeExtractedRows(
      [lineItem(100, { page: 7 }), total(300, { page: 7 })],
      2021,
      page("| Road | 100 |\nTotal emissions were 300 t."),
    );
    expect(prose.summary.reportedTotals[0]).toMatchObject({
      page: 7,
      onTableLine: false,
    });
  });
});

describe("CC-1163 stage 1: rows without a unit on a page naming another unit", () => {
  it("keeps a unit-less row on a kt page and marks it", () => {
    const result = finalizeExtractedRows(
      [lineItem(1234, { unit: null })],
      2021,
      page("Table 4: Emissions (kt CO2e)\n| Road | 1,234 |"),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].unitCheck).toBe("missing");
    expect(result.rows[0].totalCO2e).toBe(1234);
    expect(result.summary.droppedRows.unsupported_unit).toBeUndefined();
  });

  it("marks a unit-less row on a mixed t and kt page", () => {
    const result = finalizeExtractedRows(
      [lineItem(1234, { unit: null })],
      2021,
      page(
        "Table 4: Emissions (t CO2e)\n| Road | 1,234 |\n" +
          "Table 5: Emissions (kt CO2e)\n| Rail | 12.5 |",
      ),
    );
    expect(result.rows[0].unitCheck).toBe("missing");
  });

  it("marks a unit-less row on a kg page", () => {
    const result = finalizeExtractedRows(
      [lineItem(1234, { unit: null })],
      2021,
      page("Tabla 4: Emisiones (kg CO2e)\n| Road | 1,234 |"),
    );
    expect(result.rows[0].unitCheck).toBe("missing");
  });

  it("does not mark a unit-less row when the table names tonnes and only a Figure names kt", () => {
    const result = finalizeExtractedRows(
      [lineItem(1234, { unit: null })],
      2021,
      page(
        "Table 4: Emissions (t CO2e)\n| Road | 1,234 |\n" +
          "Figure 2: Emissions by sector (kt CO2e)",
      ),
    );
    expect(result.rows[0].unitCheck).toBeUndefined();
  });

  it("keeps a unit-less total on a kt page out of the reconciliation targets", () => {
    const result = finalizeExtractedRows(
      [lineItem(1234, { unit: null }), total(1234, { unit: null })],
      2021,
      page("Table 4: Emissions (kt CO2e)\n| Road | 1,234 |\n| Total | 1,234 |"),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.summary.reportedTotals).toEqual([]);
    expect(result.summary.droppedRows.unsupported_unit).toBe(1);
  });
});
