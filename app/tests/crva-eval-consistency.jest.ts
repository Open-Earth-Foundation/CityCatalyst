import { describe, expect, it } from "@jest/globals";
import {
  consistency,
  consistencyMarkdown,
} from "../scripts/crva-eval/consistency";
import type { RunStats } from "../scripts/crva-eval/run-adapter";
import type { ModelStatus, ScoredRow } from "../scripts/crva-eval/types";

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
    modelValue: "",
    modelEvidence: "",
    modelStatus: "FOUND",
    verdict: null,
    notes: "",
    reason: "",
    uncertain: false,
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
    completionTokens: 100,
    llmCalls: 1,
    nonStopFinishes: 0,
    valuesKept: 10,
    valuesDropped: 1,
    droppedByReason: {},
    fieldsWithValue: 1,
    figures: 0,
    warnings: 0,
    ...partial,
  };
}

function runsWith(statuses: ModelStatus[]) {
  return statuses.map((modelStatus, i) => ({
    stats: stats(i + 1),
    rows: [row({ modelStatus })],
  }));
}

describe("consistency", () => {
  it("does not count a row as same when one run differs", () => {
    const runs = runsWith(["FOUND", "FOUND", "NOT_FOUND", "FOUND", "FOUND"]);
    expect(consistency({ runs }).sameStatusShare).toBe(0);
    expect(
      consistency({ runs: runsWith(["FOUND", "FOUND"]) }).sameStatusShare,
    ).toBe(1);
  });

  it("covers v0 gold rows with a gold status only", () => {
    const other = (n: number, same: ModelStatus) => (n === 1 ? "FOUND" : same);
    const runs = [1, 2].map((n) => ({
      stats: stats(n),
      rows: [
        row({ rowNumber: 2, modelStatus: "FOUND" }),
        row({
          rowNumber: 3,
          isV0Field: false,
          modelStatus: other(n, "NOT_FOUND"),
        }),
        row({
          rowNumber: 4,
          goldStatus: "N/A",
          modelStatus: other(n, "NOT_FOUND"),
        }),
        row({
          kind: "extra",
          rowNumber: null,
          modelStatus: other(n, "NOT_FOUND"),
        }),
        row({
          rowNumber: 5,
          fieldId: "A1.3",
          modelStatus: other(n, "PARTIAL"),
        }),
      ],
    }));
    const result = consistency({ runs });
    expect(result.sameStatusShare).toBe(0.5);
    expect(result.perField).toEqual({ "A1.2a": 1, "A1.3": 0 });
  });

  it("computes min/max and reports averages", () => {
    const runs = [
      {
        stats: stats(1, {
          minutes: 10,
          valuesKept: 5,
          valuesDropped: 0,
          promptTokens: 100,
          completionTokens: 10,
        }),
        rows: [],
      },
      {
        stats: stats(2, {
          minutes: 30,
          valuesKept: 9,
          valuesDropped: 4,
          promptTokens: 300,
          completionTokens: 30,
        }),
        rows: [],
      },
    ];
    expect(consistency({ runs }).minMax).toEqual({
      valuesKept: { min: 5, max: 9 },
      valuesDropped: { min: 0, max: 4 },
      minutes: { min: 10, max: 30 },
    });
    const md = consistencyMarkdown({ runs }, ["run-3 (failed)"]);
    expect(md).toContain("Average minutes: 20");
    expect(md).toContain("Max minutes: 30");
    expect(md).toContain("Average prompt tokens: 200");
    expect(md).toContain("Average completion tokens: 20");
    expect(md).toContain("run-3 (failed)");
  });
});

describe("consistencyMarkdown with too few runs", () => {
  it("notes that consistency needs at least 2 runs", () => {
    const one = consistencyMarkdown({ runs: runsWith(["FOUND"]) });
    expect(one).toContain("consistency needs at least 2 runs");
    const two = consistencyMarkdown({ runs: runsWith(["FOUND", "FOUND"]) });
    expect(two).not.toContain("consistency needs at least 2 runs");
  });
});
