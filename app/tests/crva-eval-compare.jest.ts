import { describe, expect, it } from "@jest/globals";
import { compareRows } from "../scripts/crva-eval/compare";
import type { RunStats } from "../scripts/crva-eval/run-adapter";
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
    modelValue: "x",
    modelEvidence: "",
    modelStatus: "FOUND",
    verdict: "Correct",
    notes: "",
    reason: "",
    uncertain: false,
    partialReason: null,
    cause: null,
    judgeVerdict: null,
    ...partial,
  };
}

function stats(run: number, partial: Partial<RunStats> = {}): RunStats {
  return {
    run,
    status: "ok",
    minutes: 10,
    parts: 1,
    retries: 0,
    ocrPages: 0,
    promptTokens: 1000,
    completionTokens: 200,
    llmCalls: 5,
    nonStopFinishes: 0,
    valuesKept: 9,
    valuesDropped: 1,
    droppedByReason: {},
    fieldsWithValue: 5,
    figures: 0,
    warnings: 0,
    ...partial,
  };
}

// Two v0 rows: one Correct, one Wrong content -> 50% share.
const half = [
  row({ rowNumber: 2 }),
  row({ rowNumber: 3, verdict: "Wrong content" }),
];
const all = [row({ rowNumber: 2 }), row({ rowNumber: 3 })];

describe("compareRows", () => {
  it("prints a header and one row per label", () => {
    const table = compareRows([
      { label: "v0", scored: [half], stats: [stats(1)] },
      {
        label: "A",
        scored: [all],
        stats: [stats(1, { modelTurns: 40, toolCalls: 90 })],
      },
    ]).split("\n");
    expect(table).toHaveLength(4);
    expect(table[0]).toMatch(/^\| Label \|/);
    expect(table[2]).toMatch(/^\| v0 \|/);
    expect(table[3]).toMatch(/^\| A \|/);
    // v0 has no model turns, the agent does.
    expect(table[2]).toMatch(/\| — \|$/);
    expect(table[3]).toMatch(/\| 40 \|$/);
  });

  it("shows one value for 1 run and min–max for 2 runs", () => {
    const [, , one, two] = compareRows([
      { label: "one", scored: [half], stats: [stats(1)] },
      { label: "two", scored: [half, all], stats: [stats(1), stats(2)] },
    ]).split("\n");
    expect(one).toContain("| 50.0% |");
    expect(two).toContain("| 50.0%–100.0% |");
  });

  it("counts a run without a score as failed", () => {
    const [, , line] = compareRows([
      {
        label: "A",
        scored: [all],
        stats: [stats(1), stats(2, { status: "failed" })],
      },
    ]).split("\n");
    expect(line).toContain("| 1 (1 failed) |");
  });
});
