import { describe, expect, it } from "@jest/globals";
import {
  isGpcExcluded,
  parseRefs,
  scoreFile,
  type KeyFile,
  type KeyRow,
  type StoredValue,
} from "./score";

function row(partial: Partial<KeyRow>): KeyRow {
  return {
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
  };
}

function keyFile(rows: KeyRow[], extra: Partial<KeyFile> = {}): KeyFile {
  return {
    id: "T-001",
    city: "Test",
    country: "Testland",
    year: 2021,
    fileName: "test.pdf",
    expectedTotal: 300,
    toleranceText: "±1 t",
    tolerance: 1,
    totalTolerance: 1,
    keyValueRows: rows.filter((item) => item.rowType.startsWith("Value"))
      .length,
    rows,
    distractors: [],
    ...extra,
  };
}

const stored = (
  gpc: string,
  scope: string,
  valueT: number,
  extra: Partial<StoredValue> = {},
): StoredValue => ({
  gpc,
  scope,
  valueT,
  omit: false,
  notation: null,
  ...extra,
});

describe("parseRefs", () => {
  it("reads single, multiple, wildcard and parenthesised refs", () => {
    expect(parseRefs("I.1.1")).toEqual({ refs: ["I.1.1"], alternates: [] });
    expect(parseRefs("I.1.1 / I.2.1 / I.3.1").refs).toEqual([
      "I.1.1",
      "I.2.1",
      "I.3.1",
    ]);
    expect(parseRefs("I.1.x (all scopes)").refs).toEqual(["I.1.x"]);
    expect(parseRefs("I.2.1 (alt. I.4.4)")).toEqual({
      refs: ["I.2.1"],
      alternates: ["I.4.4"],
    });
    expect(parseRefs("To confirm (I.4.x)").refs).toEqual(["I.4.x"]);
    expect(parseRefs("To confirm").refs).toEqual([]);
    expect(parseRefs("IV (IV.1, IV.2)").refs).toEqual(["IV.1", "IV.2"]);
  });
});

describe("scoreFile", () => {
  const rows = [
    row({ description: "res s1", value: 100, gpc: "I.1.1", scope: "1" }),
    row({ description: "res s2", value: 150, gpc: "I.1.2", scope: "2" }),
    row({
      description: "grid",
      value: 50,
      gpc: "I.4.4",
      scope: "1",
      rowType: "Value (not in total)",
    }),
  ];

  it("scores a perfect import", () => {
    const score = scoreFile(keyFile(rows, { expectedTotal: 250 }), [
      stored("I.1.1", "1", 100),
      stored("I.1.2", "2", 150),
      stored("I.4.4", "1", 50, { omit: true }),
    ]);
    expect(score.keyValueRows).toBe(3);
    expect(score.rowRecall).toBe(1);
    expect(score.rowPrecision).toBe(1);
    expect(score.valueAccuracy).toBe(1);
    expect(score.classificationAccuracy).toBe(1);
    expect(score.storedTotal).toBe(250);
    expect(score.totalWithinTolerance).toBe(true);
    expect(score.unexpectedStored).toEqual([]);
  });

  it("counts a missing row and a wrong total", () => {
    const score = scoreFile(keyFile(rows, { expectedTotal: 250 }), [
      stored("I.1.1", "1", 100),
    ]);
    expect(score.rowRecall).toBeCloseTo(1 / 3);
    expect(score.rowPrecision).toBe(1);
    expect(score.missingRows.map((item) => item.gpc)).toEqual([
      "I.1.2",
      "I.4.4",
    ]);
    expect(score.totalDiffPct).toBeCloseTo(-60);
    expect(score.totalWithinTolerance).toBe(false);
  });

  it("separates a right value on the wrong reference", () => {
    const score = scoreFile(keyFile(rows.slice(0, 2), { expectedTotal: 250 }), [
      stored("I.1.1", "1", 100),
      stored("I.2.2", "2", 150),
    ]);
    expect(score.rowRecall).toBe(0.5);
    expect(score.classificationAccuracy).toBe(0.5);
    expect(score.unexpectedStored).toEqual([
      { gpc: "I.2.2", scope: "2", valueT: 150 },
    ]);
  });

  it("flags a stored total or other-year value from the distractor list", () => {
    const score = scoreFile(
      keyFile(rows.slice(0, 1), {
        expectedTotal: 100,
        distractors: [
          {
            where: "p. 7",
            what: "sector total",
            examples: "250",
            numbers: [250],
            failureMode: "Total row stored as data",
          },
        ],
      }),
      [stored("I.1.1", "1", 100), stored("I.9.9", "1", 250)],
    );
    expect(score.rowPrecision).toBe(0.5);
    expect(score.distractorsStored).toEqual([
      {
        valueT: 250,
        gpc: "I.9.9",
        what: "sector total",
        failureMode: "Total row stored as data",
      },
    ]);
  });

  it("compares unsplit rows as a sum under a wildcard ref", () => {
    const score = scoreFile(
      keyFile(
        [
          row({
            value: 90,
            gpc: "I.1.x (all scopes)",
            scope: "",
            ambiguous: true,
          }),
        ],
        { expectedTotal: 90 },
      ),
      [stored("I.1.1", "1", 60), stored("I.1.2", "2", 30)],
    );
    expect(score.rowRecall).toBe(1);
    expect(score.rowPrecision).toBe(1);
  });

  it("sums several key rows with the same ref and scope", () => {
    const score = scoreFile(
      keyFile(
        [
          row({ value: 40, gpc: "I.1.1", scope: "1", ambiguous: true }),
          row({ value: 60, gpc: "I.1.1", scope: "1", ambiguous: true }),
        ],
        { expectedTotal: 100 },
      ),
      [stored("I.1.1", "1", 100)],
    );
    expect(score.rowRecall).toBe(1);
  });

  it("scores notation keys only when marked as scored", () => {
    const score = scoreFile(
      keyFile(
        [
          row({
            rowType: "Notation key",
            gpc: "I.5.1",
            notation: "NO",
            scored: true,
          }),
          row({
            rowType: "Notation key",
            gpc: "I.6.1",
            notation: "NE",
            scored: false,
          }),
        ],
        { expectedTotal: 0 },
      ),
      [stored("I.5.1", "1", 0, { notation: "no-occurrance" })],
    );
    expect(score.notationScored).toBe(1);
    expect(score.notationRecovered).toBe(1);
  });

  it("matches a value-only row when the ref is not known", () => {
    const score = scoreFile(
      keyFile(
        [row({ value: 75, gpc: "To confirm", scope: "1", ambiguous: true })],
        {
          expectedTotal: 75,
        },
      ),
      [stored("V.2", "1", 75)],
    );
    expect(score.rowRecall).toBe(1);
    expect(score.classificationAccuracy).toBeNull();
  });

  it("reports a subsector view that ignores the scope split", () => {
    const score = scoreFile(keyFile(rows.slice(0, 2), { expectedTotal: 250 }), [
      stored("I.1.1", "1", 250),
    ]);
    expect(score.rowRecall).toBe(0);
    expect(score.subsectorRecall).toBe(1);
  });
  it("accepts a subsector ref such as I.1 for a row the source does not split", () => {
    const score = scoreFile(
      keyFile(
        [row({ value: 300, gpc: "I.1 (all scopes)", ambiguous: true })],
        { expectedTotal: 300 },
      ),
      [stored("I.1.1", "1", 200), stored("I.1.2", "2", 100)],
    );
    expect(score.rowRecall).toBe(1);
    expect(score.rowPrecision).toBe(1);
    expect(score.unexpectedStored).toEqual([]);
  });

  it("does not let I.1 match another subsector", () => {
    const score = scoreFile(
      keyFile([row({ value: 300, gpc: "I.1", ambiguous: true })], {
        expectedTotal: 300,
      }),
      [stored("I.2.1", "1", 300)],
    );
    expect(score.rowRecall).toBe(0);
  });

  it("skips Value rows marked as not scored", () => {
    const score = scoreFile(
      keyFile([
        row({ value: 100, gpc: "I.1.1", scope: "1" }),
        row({ value: 50, gpc: "I.4.4", scope: "1", scored: false }),
      ]),
      [stored("I.1.1", "1", 100)],
    );
    expect(score.keyValueRows).toBe(1);
    expect(score.rowRecall).toBe(1);
  });

  it("scores a key with no scored Value rows on the total only", () => {
    const score = scoreFile(
      keyFile([row({ value: 300, gpc: "I.1.1", scope: "1", scored: false })]),
      [stored("I.1.1", "1", 300)],
    );
    expect(score.rowRecall).toBeNull();
    expect(score.totalWithinTolerance).toBe(true);
  });

  it("matches a zero key row with no stored row", () => {
    const score = scoreFile(
      keyFile([
        row({ value: 100, gpc: "I.1.1", scope: "1" }),
        row({ value: 0, gpc: "I.4.1", scope: "1" }),
      ]),
      [stored("I.1.1", "1", 100), stored("I.4.1", "1", 0)],
    );
    expect(score.rowRecall).toBe(1);
    expect(score.valueAccuracy).toBe(1);
    expect(score.rowPrecision).toBe(1);
  });

  it("keeps the GPC exclusions out of the stored total", () => {
    const score = scoreFile(keyFile([], { expectedTotal: 100 }), [
      stored("I.1.1", "1", 100),
      stored("I.4.4", "1", 7),
      stored("III.4.3", "3", 608),
      stored("VI.1", "1", 1188394),
    ]);
    expect(score.storedTotal).toBe(100);
    expect(score.totalWithinTolerance).toBe(true);
  });

  it("recognises only the excluded references", () => {
    expect(["I.4.4", "III.1.3", "III.4.3", "VI.1"].every(isGpcExcluded)).toBe(
      true,
    );
    expect(["I.4.3", "III.1.2", "II.1.3", "IV.1"].some(isGpcExcluded)).toBe(
      false,
    );
  });

  it("scores a non-GPC file on the total only", () => {
    const score = scoreFile(
      keyFile([row({ value: 300, gpc: "I.1.x", ambiguous: true })], {
        expectedTotal: 300,
        nonGpc: true,
      }),
      [stored("I.1.1", "1", 300)],
    );
    expect(score.rowRecall).toBeNull();
    expect(score.rowPrecision).toBeNull();
    expect(score.valueAccuracy).toBeNull();
    expect(score.totalWithinTolerance).toBe(true);
    expect(score.storedTotal).toBe(300);
  });
});
