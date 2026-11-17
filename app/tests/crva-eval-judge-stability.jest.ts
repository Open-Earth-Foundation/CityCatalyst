import { describe, expect, it } from "@jest/globals";
import {
  judgeStability,
  judgeStabilityMarkdown,
} from "../scripts/crva-eval/judge-stability";
import { outDirName } from "../scripts/crva-eval/score-run";
import type { ScoredRow } from "../scripts/crva-eval/types";

function row(partial: Partial<ScoredRow>): ScoredRow {
  return {
    kind: "gold",
    rowNumber: 2,
    fieldId: "A1.2a",
    itemKey: "k",
    goldStatus: "FOUND",
    goldValue: "",
    goldEvidence: "",
    goldPages: [],
    isV0Field: true,
    trap: false,
    modelValue: "v",
    modelEvidence: "e",
    modelStatus: "FOUND",
    verdict: "Correct",
    notes: "",
    reason: "",
    uncertain: false,
    partialReason: null,
    cause: null,
    ...partial,
  };
}

const a = [
  row({ rowNumber: 2 }),
  row({ rowNumber: 3, modelValue: "w", verdict: "Correct" }),
  row({ rowNumber: 4, fieldId: "A2.1", modelValue: "x", verdict: "Partial" }),
  row({ rowNumber: 5, goldStatus: "N/A", verdict: "Hallucination" }),
  row({ kind: "extra", rowNumber: null, modelValue: "only-a" }),
  row({
    kind: "extra",
    rowNumber: null,
    fieldId: "A2.1",
    itemKey: "z",
    modelValue: "z",
    verdict: "Hallucination",
  }),
];
const b = [
  row({ rowNumber: 2 }),
  row({ rowNumber: 3, modelValue: "w", verdict: "Wrong content" }),
  row({
    rowNumber: 4,
    fieldId: "A2.1",
    modelValue: "x",
    verdict: "Partial",
    modelStatus: "PARTIAL",
  }),
  row({ rowNumber: 5, goldStatus: "N/A", verdict: "Correct" }),
  row({ kind: "extra", rowNumber: null, modelValue: "only-b" }),
  row({
    kind: "extra",
    rowNumber: null,
    fieldId: "A2.1",
    itemKey: "z",
    modelValue: "z",
    verdict: "Unsupported inference",
  }),
];

describe("judgeStability", () => {
  const result = judgeStability(a, b);

  it("compares gold rows by row number, skipping N/A", () => {
    expect(result.gold).toEqual({ total: 3, sameVerdict: 2, sameStatus: 2 });
  });

  it("compares model values by field, value and evidence", () => {
    // v, w, x, z in both; only-a and only-b are one-sided.
    expect(result.values.matched).toBe(4);
    expect(result.values.sameVerdict).toBe(2);
    expect(result.values.onlyA).toHaveLength(1);
    expect(result.values.onlyB).toHaveLength(1);
    expect(result.values.onlyA[0]).toContain("only-a");
  });

  it("builds a per-field table for v0 fields", () => {
    expect(result.perField["A1.2a"]).toEqual({
      goldTotal: 2,
      goldSame: 1,
      valuesTotal: 2,
      valuesSame: 1,
    });
    expect(result.perField["A2.1"].goldSame).toBe(1);
  });

  it("lists changed rows, gold and extra, capped at 50", () => {
    expect(result.changed.map((c) => `${c.verdictA}>${c.verdictB}`)).toEqual(
      expect.arrayContaining([
        "Correct>Wrong content",
        "Hallucination>Unsupported inference",
      ]),
    );
    const many = Array.from({ length: 60 }, (_, i) =>
      row({ rowNumber: i + 10, modelValue: `m${i}` }),
    );
    const flipped = many.map((r) => ({ ...r, verdict: "Omission" as const }));
    expect(judgeStability(many, flipped).changed).toHaveLength(50);
  });
});

describe("judgeStabilityMarkdown", () => {
  it("names the models and states the randomness caveat", () => {
    const md = judgeStabilityMarkdown(a, b, {
      a: ["gpt-5.6-sol"],
      b: ["gpt-5.6-sol"],
    });
    expect(md).toContain("gpt-5.6-sol");
    expect(md).toContain(
      "gpt-5.6-sol does not accept temperature 0; no seed is sent; differences are judge randomness.",
    );
    expect(md).toContain("Share correct");
    expect(md).toContain("Correct -> Wrong content");
  });
});

describe("score-run --out", () => {
  it("defaults to score-run-<n>", () => {
    expect(outDirName(undefined, "2")).toBe("score-run-2");
    expect(outDirName("score-run-1-b", "1")).toBe("score-run-1-b");
  });
  it("rejects paths and empty names", () => {
    for (const bad of ["a/b", "a\\b", "..", ".", "", "../x"]) {
      expect(() => outDirName(bad, "1")).toThrow("plain directory name");
    }
  });
});
