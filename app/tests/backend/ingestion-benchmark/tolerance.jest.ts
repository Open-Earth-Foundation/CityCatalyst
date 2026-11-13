import { describe, expect, it } from "@jest/globals";
import type {
  KeyFile,
  KeyRow,
} from "@/backend/ingestion-benchmark/answer-keys";
import { PDF_PROFILE } from "@/backend/ingestion-benchmark/profiles";
import { scoreFile } from "@/backend/ingestion-benchmark/score";
import {
  rowTolerance,
  totalTolerance,
  UNIT_TONNES,
} from "@/backend/ingestion-benchmark/tolerance";

const row: KeyRow = {
  row: 1,
  description: "row",
  year: 2021,
  value: 10_000_000,
  gpc: "I.1.1",
  scope: "1",
  ambiguous: false,
  rowType: "Value",
  notation: "",
  scored: true,
  note: "",
};

function keyFile(extra: Partial<KeyFile> = {}): KeyFile {
  return {
    id: "T-001",
    city: "Test",
    country: "Testland",
    year: 2021,
    fileName: "test.pdf",
    expectedTotal: 10_000_000,
    toleranceText: "±1 t",
    tolerance: 1,
    totalTolerance: 1,
    keyValueRows: 1,
    rows: [row],
    distractors: [],
    ...extra,
  };
}

const storedRow = (valueT: number) => [
  { gpc: "I.1.1", scope: "1", valueT, omit: false, notation: null },
];

describe("rowTolerance", () => {
  it("whole tonnes give ±0.5 t", () => {
    expect(
      rowTolerance(keyFile({ printedUnit: "t", printedDecimals: 0 })),
    ).toEqual({ tonnes: 0.5, source: "rule" });
  });

  it("MMT with 2 decimals give ±5,000 t", () => {
    const result = rowTolerance(
      keyFile({ printedUnit: "Mt", printedDecimals: 2 }),
    );
    expect(result.tonnes).toBeCloseTo(5000, 6);
    expect(result.source).toBe("rule");
    expect(UNIT_TONNES.kt).toBe(1e3);
  });

  it("has no percentage floor", () => {
    const key = keyFile({ printedUnit: "t", printedDecimals: 0 });
    expect(scoreFile(key, storedRow(10_000_000.4)).matchedRows).toBe(1);
    expect(scoreFile(key, storedRow(10_000_001)).matchedRows).toBe(0);
  });

  it("falls back to legacy when fields are missing", () => {
    expect(rowTolerance(keyFile({ tolerance: 0.01 }))).toEqual({
      tonnes: 0.01,
      source: "legacy",
    });
    expect(rowTolerance(keyFile({ printedUnit: "t" })).source).toBe("legacy");
    expect(rowTolerance(keyFile({ printedDecimals: 0 })).source).toBe("legacy");
    const score = scoreFile(
      keyFile({ tolerance: 0.01 }),
      storedRow(10_000_000),
    );
    expect(score.toleranceSource).toBe("legacy");
  });

  it("legacy PDF profile keeps its 0.5 t floor, the rule does not", () => {
    expect(PDF_PROFILE.valueTolerance(keyFile({ tolerance: 0.01 }), 5)).toBe(
      0.5,
    );
    expect(
      PDF_PROFILE.valueTolerance(
        keyFile({ printedUnit: "kt", printedDecimals: 1 }),
        5,
      ),
    ).toBeCloseTo(50, 6);
  });
});

describe("totalTolerance", () => {
  it("uses totalPrintedDecimals when set", () => {
    const key = keyFile({
      printedUnit: "kt",
      printedDecimals: 0,
      totalPrintedDecimals: 2,
    });
    expect(totalTolerance(key).tonnes).toBeCloseTo(5, 6);
    expect(totalTolerance(key).source).toBe("rule");
    expect(rowTolerance(key).tonnes).toBeCloseTo(500, 6);
  });

  it("falls back to printedDecimals, then legacy", () => {
    expect(
      totalTolerance(keyFile({ printedUnit: "t", printedDecimals: 0 })).tonnes,
    ).toBe(0.5);
    expect(totalTolerance(keyFile({ totalTolerance: 7 }))).toEqual({
      tonnes: 7,
      source: "legacy",
    });
  });

  it("scoreFile applies the rule to the total and reports the source", () => {
    const key = keyFile({
      printedUnit: "kt",
      printedDecimals: 0,
      totalPrintedDecimals: 0,
    });
    expect(scoreFile(key, storedRow(10_000_400)).totalWithinTolerance).toBe(
      true,
    );
    const far = scoreFile(key, storedRow(10_000_600));
    expect(far.totalWithinTolerance).toBe(false);
    expect(far.toleranceSource).toBe("rule");
  });
});
