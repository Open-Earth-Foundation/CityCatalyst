import { describe, expect, it } from "@jest/globals";
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";
import type {
  CaseResult,
  RunEntry,
} from "@/backend/ingestion-benchmark/report";
import {
  rescoreCase,
  stableTotal,
} from "@/backend/ingestion-benchmark/rescore";

const key: KeyFile = {
  id: "T-001",
  city: "Test",
  country: "Testland",
  year: 2021,
  fileName: "test.pdf",
  expectedTotal: 100,
  toleranceText: "±1 t",
  tolerance: 1,
  totalTolerance: 1,
  keyValueRows: 1,
  rows: [
    {
      row: 1,
      description: "stationary",
      year: 2021,
      value: 100,
      gpc: "I.1.1",
      scope: "1",
      ambiguous: false,
      rowType: "Value",
      notation: "",
      scored: true,
      note: "",
    },
  ],
  distractors: [],
};

const run = (n: number, partial: Partial<RunEntry> = {}): RunEntry => ({
  run: n,
  failureMode: "scored",
  warnings: [],
  stageMs: { ocr: null, extraction: null, import: null, total: 1000 },
  ok: true,
  ms: 1000,
  total: 100,
  ...partial,
});

const result = (runs: RunEntry[]): CaseResult => ({
  id: "T-001",
  file: "test.pdf",
  kind: "pdf",
  targetYear: 2021,
  keyId: "OLD",
  ocr: { ok: true, code: null },
  productFlowFailsAtOcr: false,
  runs,
  stableTotal: false,
  block: "validated",
  eligible: true,
  totalOnly: false,
});

describe("stableTotal", () => {
  it("needs two or more finished runs with the same rounded total", () => {
    expect(
      stableTotal(result([run(1, { total: 100.2 }), run(2, { total: 99.8 })])),
    ).toBe(true);
    expect(
      stableTotal(result([run(1, { total: 100 }), run(2, { total: 102 })])),
    ).toBe(false);
    expect(stableTotal(result([run(1)]))).toBe(false);
  });

  it("ignores failed runs", () => {
    const runs = [run(1), run(2), run(3, { ok: false, total: 5 })];
    expect(stableTotal(result(runs))).toBe(true);
  });
});

describe("rescoreCase", () => {
  it("rescores stored runs with the new key and leaves failed runs alone", () => {
    const failed = run(2, { ok: false, message: "boom" });
    const stored = [
      { gpc: "I.1.1", scope: "1", valueT: 100, omit: false, notation: null },
    ];
    const rescored = rescoreCase(result([run(1, { stored }), failed]), key);

    expect(rescored.keyId).toBe("T-001");
    expect(rescored.runs[0].score?.matchedRows).toBe(1);
    expect(rescored.runs[1]).toBe(failed);
    expect(rescored.stableTotal).toBe(false);
  });

  it("scores a total-only case on the total, not row by row", () => {
    const stored = [
      { gpc: "I.1.1", scope: "1", valueT: 100, omit: false, notation: null },
    ];
    const rescored = rescoreCase(
      { ...result([run(1, { stored })]), totalOnly: true },
      key,
    );
    expect(rescored.runs[0].score?.rowRecall).toBeNull();
    expect(rescored.runs[0].score?.totalWithinTolerance).toBe(true);
  });

  it("recomputes the parent-reference variant of a pipeline run from its stored values and dropped parent-reference rows", () => {
    const withParent: KeyFile = {
      ...key,
      expectedTotal: 140,
      keyValueRows: 2,
      rows: [
        ...key.rows,
        { ...key.rows[0], row: 2, gpc: "I.3.x", scope: "", value: 40 },
      ],
    };
    const stored = [
      { gpc: "I.1.1", scope: "1", valueT: 100, omit: false, notation: null },
    ];
    const pipeline = {
      parentRefRows: [
        { gpc: "I.3", scope: null, valueT: 40, omit: false, notation: null },
      ],
      variantScore: null,
    } as unknown as RunEntry["pipeline"];
    const [entry] = rescoreCase(
      result([run(1, { stored, pipeline })]),
      withParent,
    ).runs;
    expect(entry.score?.matchedRows).toBe(1);
    expect(entry.pipeline?.variantScore?.matchedRows).toBe(2);
    expect(entry.pipeline?.variantScore?.totalWithinTolerance).toBe(true);
    expect(entry.pipeline?.parentRefRows).toEqual(pipeline?.parentRefRows);
  });

  it("adds no pipeline to a built-in run", () => {
    const stored = [
      { gpc: "I.1.1", scope: "1", valueT: 100, omit: false, notation: null },
    ];
    expect(
      rescoreCase(result([run(1, { stored })]), key).runs[0].pipeline,
    ).toBeUndefined();
  });
});
