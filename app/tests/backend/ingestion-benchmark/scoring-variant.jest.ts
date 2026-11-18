import { describe, expect, it } from "@jest/globals";
import type {
  KeyFile,
  KeyRow,
} from "@/backend/ingestion-benchmark/answer-keys";
import {
  scoreFile,
  type StoredValue,
} from "@/backend/ingestion-benchmark/score";
import {
  scoreWithVariant,
  scoringReference,
} from "@/backend/ingestion-benchmark/scoring-variant";

const keyRow = (partial: Partial<KeyRow>): KeyRow => ({
  row: 1,
  description: "row",
  year: 2021,
  value: null,
  gpc: "",
  scope: "",
  ambiguous: false,
  rowType: "Value",
  notation: "",
  scored: true,
  note: "",
  ...partial,
});

const keyFile = (rows: KeyRow[], expectedTotal: number | null): KeyFile => ({
  id: "T-001",
  city: "Test",
  country: "Testland",
  year: 2021,
  fileName: "test.pdf",
  expectedTotal,
  toleranceText: "±1 t",
  tolerance: 1,
  totalTolerance: 1,
  keyValueRows: rows.length,
  rows,
  distractors: [],
});

const value = (
  gpc: string,
  scope: string | null,
  valueT: number,
): StoredValue => ({ gpc, scope, valueT, omit: false, notation: null });

describe("scoringReference (Mirco's rule from comparison-bridge.ts)", () => {
  it("turns an unsplit I, II or III subsector into its .x wildcard form", () => {
    expect(scoringReference("I.1")).toBe("I.1.x");
    expect(scoringReference("II.3")).toBe("II.3.x");
    expect(scoringReference("III.1")).toBe("III.1.x");
  });

  it("leaves a child reference such as I.1.2 unchanged", () => {
    expect(scoringReference("I.1.2")).toBe("I.1.2");
  });

  it("leaves IV, V and VI subsectors unchanged, as Mirco's rule does", () => {
    expect(scoringReference("IV.1")).toBe("IV.1");
    expect(scoringReference("V.2")).toBe("V.2");
    expect(scoringReference("VI.1")).toBe("VI.1");
  });

  it("matches only the whole reference, not text around it", () => {
    expect(scoringReference("I.1 ")).toBe("I.1 ");
    expect(scoringReference("xI.1")).toBe("xI.1");
  });
});

describe("what the .x form matches in the scorer", () => {
  it("I.1.x matches a key row written as the wildcard I.1.x, which a stored I.1 does not", () => {
    const key = keyFile([keyRow({ gpc: "I.1.x", value: 100 })], null);
    expect(scoreFile(key, [value("I.1", null, 100)]).matchedRows).toBe(0);
    expect(scoreFile(key, [value("I.1.x", null, 100)]).matchedRows).toBe(1);
  });

  it("I.1.x still matches a key row written as the subsector I.1", () => {
    const key = keyFile([keyRow({ gpc: "I.1", value: 100 })], null);
    expect(scoreFile(key, [value("I.1.x", null, 100)]).matchedRows).toBe(1);
  });

  it("I.1.x never matches an exact scoped child key row such as I.1.1 scope 1", () => {
    const key = keyFile(
      [keyRow({ gpc: "I.1.1", scope: "1", value: 100 })],
      null,
    );
    expect(scoreFile(key, [value("I.1.x", null, 100)]).matchedRows).toBe(0);
    expect(scoreFile(key, [value("I.1.x", "1", 100)]).matchedRows).toBe(0);
  });
});

describe("scoreWithVariant", () => {
  const key = keyFile(
    [
      keyRow({ gpc: "I.1.1", scope: "1", value: 100 }),
      keyRow({ row: 2, gpc: "I.3.x", value: 40 }),
    ],
    140,
  );
  const stored = [value("I.1.1", "1", 100)];
  const parentRefRows = [value("I.3", null, 40)];

  it("keeps the standard score exactly as scoreFile gives it", () => {
    const { standard } = scoreWithVariant(key, stored, parentRefRows);
    expect(standard).toEqual(scoreFile(key, stored));
    expect(standard.matchedRows).toBe(1);
    expect(standard.totalWithinTolerance).toBe(false);
  });

  it("scores the variant on the stored values plus the dropped parent-reference rows, as .x", () => {
    const { parentRefs } = scoreWithVariant(key, stored, parentRefRows);
    expect(parentRefs).toEqual(
      scoreFile(key, [value("I.1.1", "1", 100), value("I.3.x", null, 40)]),
    );
    expect(parentRefs.matchedRows).toBe(2);
    expect(parentRefs.totalWithinTolerance).toBe(true);
  });

  it("applies the rule to stored values too, and adds nothing without parent-reference rows", () => {
    const both = scoreWithVariant(key, [...stored, value("I.3", null, 40)]);
    expect(both.parentRefs.matchedRows).toBe(2);
    expect(scoreWithVariant(key, stored).parentRefs).toEqual(
      scoreFile(key, stored),
    );
  });
});
