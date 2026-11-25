import { describe, expect, it } from "@jest/globals";
import type {
  KeyFile,
  KeyRow,
} from "@/backend/ingestion-benchmark/answer-keys";
import {
  PDF_PROFILE,
  STRUCTURED_PROFILE,
} from "@/backend/ingestion-benchmark/profiles";
import {
  scoreFile,
  type StoredValue,
} from "@/backend/ingestion-benchmark/score";

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
    expectedTotal: null,
    toleranceText: "±1 t",
    tolerance: 1,
    totalTolerance: 1,
    distractors: [],
    nonGpc: false,
    rows,
    ...extra,
  } as KeyFile;
}

function stored(gpc: string, scope: string, valueT: number): StoredValue {
  return { gpc, scope, valueT, omit: false, notation: null };
}

describe("scoring profiles", () => {
  const parentKey = keyFile([row({ gpc: "I.1", scope: "1", value: 300 })]);
  const children = [stored("I.1.1", "1", 100), stored("I.1.2", "1", 200)];

  it("pdf profile matches key I.1 against stored I.1.1 and I.1.2 summed", () => {
    expect(scoreFile(parentKey, children, PDF_PROFILE).rowRecall).toBe(1);
  });

  it("structured profile does not match a parent reference", () => {
    expect(scoreFile(parentKey, children, STRUCTURED_PROFILE).rowRecall).toBe(
      0,
    );
  });

  it("structured profile matches within 0.1% only", () => {
    const key = keyFile([row({ gpc: "I.1.1", scope: "1", value: 1_000_000 })]);
    const near = scoreFile(
      key,
      [stored("I.1.1", "1", 1_000_900)],
      STRUCTURED_PROFILE,
    );
    const far = scoreFile(
      key,
      [stored("I.1.1", "1", 1_001_100)],
      STRUCTURED_PROFILE,
    );
    expect(near.rowRecall).toBe(1);
    expect(far.rowRecall).toBe(0);
  });

  it("pdf profile zero row matches absent row", () => {
    const key = keyFile([row({ gpc: "I.1.1", scope: "1", value: 0 })]);
    expect(scoreFile(key, [], PDF_PROFILE).rowRecall).toBe(1);
  });

  it("structured profile zero row needs a stored zero", () => {
    const key = keyFile([row({ gpc: "I.1.1", scope: "1", value: 0 })]);
    expect(scoreFile(key, [], STRUCTURED_PROFILE).rowRecall).toBe(0);
    expect(
      scoreFile(key, [stored("I.1.1", "1", 0)], STRUCTURED_PROFILE).rowRecall,
    ).toBe(1);
  });

  it("structured profile scores rows marked not scored; pdf skips them", () => {
    const key = keyFile([
      row({ gpc: "I.1.1", scope: "1", value: 100 }),
      row({ gpc: "I.2.1", scope: "1", value: 50, scored: false }),
    ]);
    expect(scoreFile(key, [], PDF_PROFILE).keyValueRows).toBe(1);
    expect(scoreFile(key, [], STRUCTURED_PROFILE).keyValueRows).toBe(2);
  });

  it("structured profile matches same ref and scope rows one by one", () => {
    const key = keyFile([
      row({ gpc: "I.1.1", scope: "1", value: 100 }),
      row({ gpc: "I.1.1", scope: "1", value: 200 }),
    ]);
    const input = [stored("I.1.1", "1", 300)];
    expect(scoreFile(key, input, PDF_PROFILE).rowRecall).toBe(1);
    expect(scoreFile(key, input, STRUCTURED_PROFILE).rowRecall).toBe(0);
  });

  it("default profile is pdf", () => {
    expect(scoreFile(parentKey, children)).toEqual(
      scoreFile(parentKey, children, PDF_PROFILE),
    );
  });
});
