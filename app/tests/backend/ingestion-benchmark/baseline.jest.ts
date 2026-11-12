import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";
import {
  caseTestSetVersion,
  combinedTestSetVersion,
  compareWithBaseline,
  loadBaseline,
  saveBaseline,
  runnerFailedCases,
  updateBaseline,
  type Baseline,
  type BaselineEntry,
} from "@/backend/ingestion-benchmark/baseline";
import { SCORER_VERSION } from "@/backend/ingestion-benchmark/score";
import type { CaseVerdict } from "@/backend/ingestion-benchmark/metrics";
import type {
  CaseResult,
  RunEntry,
  RunSummary,
} from "@/backend/ingestion-benchmark/report";
import type { CaseManifestEntry } from "@/backend/ingestion-benchmark/selection";

const manifestEntry: CaseManifestEntry = {
  id: "C-001",
  city: "Testville",
  country: "TV",
  year: 2020,
  block: "validated",
  totalOnly: false,
  textTables: true,
  fileName: "a.pdf",
};

const makeKey = (value: number, order: "a" | "b" = "a"): KeyFile => {
  const row = {
    row: 1,
    description: "x",
    year: 2020,
    value,
    gpc: "I.1.1",
    scope: "1",
    ambiguous: false,
    rowType: "Value",
    notation: "",
    scored: true,
    note: "",
  };
  const base =
    order === "a"
      ? { id: "C-001", keyValueRows: 1, expectedTotal: 10, rows: [row] }
      : { rows: [row], expectedTotal: 10, keyValueRows: 1, id: "C-001" };
  return {
    ...base,
    city: "Testville",
    country: "TV",
    year: 2020,
    fileName: "a.pdf",
    toleranceText: "",
    tolerance: 0.1,
    totalTolerance: 0.1,
    distractors: [],
  } as unknown as KeyFile;
};

const verdict = (partial: Partial<CaseVerdict> = {}): CaseVerdict => ({
  id: "C-001",
  block: "validated",
  eligible: true,
  attempts: 3,
  attemptsPassed: 3,
  casePasses: true,
  exploratory: false,
  recallFailedAsZero: 1,
  recallScoredOnly: 1,
  rowPrecision: 1,
  valueAccuracy: 1,
  classificationAccuracy: 1,
  notationScored: 0,
  notationRecovered: 0,
  distractorsStored: 0,
  totalWithinToleranceAll: true,
  tenXAttempts: 0,
  wrongTotalAttempts: 0,
  warnedWrongTotalAttempts: 0,
  failureModes: {
    scored: 3,
    ocr_error: 0,
    extraction_error: 0,
    truncated: 0,
    zero_rows: 0,
    approve_error: 0,
    readback_error: 0,
    setup_error: 0,
  },
  costUsd: null,
  seconds: 3,
  ...partial,
});

const entryOf = (partial: Partial<BaselineEntry> = {}): BaselineEntry => ({
  verdict: verdict(),
  commit: "abc",
  extractionModel: "m",
  ocrModel: null,
  promptHash: null,
  testSetVersion: "v1",
  scorerVersion: SCORER_VERSION,
  runFolder: "run-1",
  date: "2026-11-01",
  ...partial,
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "baseline-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("caseTestSetVersion", () => {
  it("version changes when a key row value changes", () => {
    expect(caseTestSetVersion(manifestEntry, makeKey(10))).not.toBe(
      caseTestSetVersion(manifestEntry, makeKey(11)),
    );
  });

  it("version is stable across key order", () => {
    const a = caseTestSetVersion(manifestEntry, makeKey(10, "a"));
    expect(a).toBe(caseTestSetVersion(manifestEntry, makeKey(10, "b")));
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });

  it("combined version ignores the order of the case versions", () => {
    expect(combinedTestSetVersion(["b", "a"])).toBe(
      combinedTestSetVersion(["a", "b"]),
    );
    expect(combinedTestSetVersion(["a"])).not.toBe(
      combinedTestSetVersion(["a", "b"]),
    );
  });
});

describe("load and save", () => {
  it("loads an empty object for a missing file and saves sorted with a trailing newline", () => {
    const path = join(dir, "baseline.json");
    expect(loadBaseline(path)).toEqual({});
    saveBaseline(path, { "C-002": entryOf(), "C-001": entryOf() });
    const text = readFileSync(path, "utf8");
    expect(text.endsWith("}\n")).toBe(true);
    expect(Object.keys(JSON.parse(text))).toEqual(["C-001", "C-002"]);
    expect(text).toContain('\n  "C-001": {');
    expect(Object.keys(loadBaseline(path))).toEqual(["C-001", "C-002"]);
  });
});

function runEntry(run: number, recall: number, total = 100): RunEntry {
  return {
    run,
    ok: true,
    ms: 1000,
    failureMode: "scored",
    warnings: [],
    stageMs: { ocr: 1, extraction: 1, import: 1, total: 1000 },
    stored: [
      { gpc: "I.1.1", scope: "1", valueT: 10, omit: false, notation: null },
    ],
    total,
    score: {
      keyValueRows: 1,
      storedGroups: 1,
      matchedRows: 1,
      rowRecall: recall,
      rowPrecision: 1,
      subsectorRecall: 1,
      valueAccuracy: 1,
      classificationAccuracy: 1,
      expectedTotal: 100,
      storedTotal: total,
      totalDiffPct: 0,
      totalWithinTolerance: true,
      toleranceSource: "rule",
      notationScored: 0,
      notationRecovered: 0,
      distractorsStored: [],
      unexpectedStored: [],
      missingRows: [],
    },
  } as unknown as RunEntry;
}

function writeRun(folder: string, results: CaseResult[]) {
  mkdirSync(join(dir, folder), { recursive: true });
  const summary = {
    measuredAt: "2026-11-01T00:00:00Z",
    commit: "abc",
    branch: "b",
    runsPerFile: 3,
    results,
  } as RunSummary;
  writeFileSync(join(dir, folder, "results.json"), JSON.stringify(summary));
}

const storedCase = (): CaseResult => ({
  id: "C-001",
  file: "a.pdf",
  kind: "pdf",
  targetYear: 2020,
  keyId: "C-001",
  ocr: { ok: true, code: null },
  productFlowFailsAtOcr: false,
  runs: [runEntry(1, 0.5), runEntry(2, 0.5), runEntry(3, 0.5)],
  stableTotal: true,
  block: "validated",
  eligible: true,
  totalOnly: false,
});

describe("compareWithBaseline", () => {
  const key = makeKey(10);
  const current = verdict({ recallFailedAsZero: 0.9 });

  it("gives no baseline for an unknown case", () => {
    const c = compareWithBaseline({
      id: "C-001",
      current,
      currentVersion: "v1",
      baseline: {},
      key,
      runsRoot: dir,
    });
    expect(c).toEqual({
      id: "C-001",
      status: "no baseline",
      baseline: null,
      rescored: false,
    });
  });

  it("same version compares directly", () => {
    const stored = verdict({ recallFailedAsZero: 0.8 });
    const c = compareWithBaseline({
      id: "C-001",
      current,
      currentVersion: "v1",
      baseline: { "C-001": entryOf({ verdict: stored }) },
      key,
      runsRoot: dir,
    });
    expect(c.status).toBe("compared");
    expect(c.rescored).toBe(false);
    expect(c.baseline).toEqual(stored);
  });

  it("same test set but another scorer version rescores the run folder", () => {
    writeRun("run-1", [storedCase()]);
    const c = compareWithBaseline({
      id: "C-001",
      current,
      currentVersion: "v1",
      baseline: {
        "C-001": entryOf({
          scorerVersion: "1",
          verdict: verdict({ recallFailedAsZero: 0.8 }),
        }),
      },
      key,
      runsRoot: dir,
    });
    expect(c.status).toBe("compared");
    expect(c.rescored).toBe(true);
    expect(c.baseline?.recallFailedAsZero).toBe(1);
  });

  it("another scorer version without a run folder keeps the stored verdict", () => {
    const stored = verdict({ recallFailedAsZero: 0.8 });
    const c = compareWithBaseline({
      id: "C-001",
      current,
      currentVersion: "v1",
      baseline: {
        "C-001": entryOf({ scorerVersion: undefined, verdict: stored }),
      },
      key,
      runsRoot: dir,
    });
    expect(c.status).toBe("compared");
    expect(c.rescored).toBe(false);
    expect(c.baseline).toEqual(stored);
  });

  it("different version rescores the baseline values", () => {
    writeRun("run-1", [storedCase()]);
    const baseline: Baseline = {
      "C-001": entryOf({ testSetVersion: "old" }),
    };
    const c = compareWithBaseline({
      id: "C-001",
      current,
      currentVersion: "new",
      baseline,
      key,
      runsRoot: dir,
    });
    expect(c.status).toBe("compared");
    expect(c.rescored).toBe(true);
    expect(c.baseline?.id).toBe("C-001");
    expect(c.baseline?.attempts).toBe(3);
    // The stored fixture scored recall 0.5; the current key matches the stored row.
    expect(c.baseline?.recallFailedAsZero).toBe(1);
  });

  it("missing run folder gives baseline stale and no regression", () => {
    const c = compareWithBaseline({
      id: "C-001",
      current,
      currentVersion: "new",
      baseline: { "C-001": entryOf({ testSetVersion: "old" }) },
      key,
      runsRoot: dir,
    });
    expect(c).toEqual({
      id: "C-001",
      status: "baseline stale",
      reason: "baseline stale: run-1/results.json not found",
      baseline: null,
      rescored: false,
    });
  });

  it("carries the cause of a failed rescore into the reason", () => {
    mkdirSync(join(dir, "run-2"), { recursive: true });
    writeFileSync(join(dir, "run-2", "results.json"), "{not json");
    const unparsable = compareWithBaseline({
      id: "C-001",
      current,
      currentVersion: "new",
      baseline: {
        "C-001": entryOf({ testSetVersion: "old", runFolder: "run-2" }),
      },
      key,
      runsRoot: dir,
    });
    expect(unparsable.status).toBe("baseline stale");
    expect(unparsable.reason).toMatch(/^baseline stale: .*JSON/);

    writeRun("run-3", [{ ...storedCase(), runs: null as never }]);
    const broken = compareWithBaseline({
      id: "C-001",
      current,
      currentVersion: "new",
      baseline: {
        "C-001": entryOf({ testSetVersion: "old", runFolder: "run-3" }),
      },
      key,
      runsRoot: dir,
    });
    expect(broken.status).toBe("baseline stale");
    expect(broken.reason).toMatch(/^baseline stale: \S/);
    expect(broken.reason).not.toBe("baseline stale");

    writeRun("run-4", []);
    expect(
      compareWithBaseline({
        id: "C-001",
        current,
        currentVersion: "new",
        baseline: {
          "C-001": entryOf({ testSetVersion: "old", runFolder: "run-4" }),
        },
        key,
        runsRoot: dir,
      }).reason,
    ).toBe("baseline stale: C-001 not in run-4/results.json");
  });

  it("gives baseline stale for a missing case or unparsable results", () => {
    writeRun("run-1", []);
    mkdirSync(join(dir, "run-2"), { recursive: true });
    writeFileSync(join(dir, "run-2", "results.json"), "{not json");
    const args = {
      id: "C-001",
      current,
      currentVersion: "new",
      key,
      runsRoot: dir,
    };
    expect(
      compareWithBaseline({
        ...args,
        baseline: { "C-001": entryOf({ testSetVersion: "old" }) },
      }).status,
    ).toBe("baseline stale");
    expect(
      compareWithBaseline({
        ...args,
        baseline: {
          "C-001": entryOf({ testSetVersion: "old", runFolder: "run-2" }),
        },
      }).status,
    ).toBe("baseline stale");
  });
});

describe("updateBaseline", () => {
  const base: Baseline = { "C-001": entryOf({ commit: "old" }) };
  const fresh = {
    "C-002": entryOf({ commit: "new" }),
  };

  it("update skips exploratory and interrupted runs", () => {
    expect(
      updateBaseline({
        baseline: base,
        entries: fresh,
        exploratory: true,
        interrupted: false,
      }),
    ).toBe(base);
    expect(
      updateBaseline({
        baseline: base,
        entries: fresh,
        exploratory: false,
        interrupted: true,
      }),
    ).toBe(base);
  });

  it("update replaces only cases in the run", () => {
    const next = updateBaseline({
      baseline: base,
      entries: {
        "C-002": entryOf({ commit: "new" }),
        "C-003": entryOf({ verdict: verdict({ attempts: 2 }) }),
      },
      exploratory: false,
      interrupted: false,
    });
    expect(Object.keys(next).sort()).toEqual(["C-001", "C-002"]);
    expect(next["C-001"].commit).toBe("old");
    expect(next["C-002"].commit).toBe("new");
  });

  it("does not record a case when an attempt failed on the runner side", () => {
    const failing = (mode: keyof CaseVerdict["failureModes"]) =>
      entryOf({
        verdict: verdict({
          failureModes: { ...verdict().failureModes, scored: 2, [mode]: 1 },
        }),
      });
    const entries = {
      "C-010": failing("approve_error"),
      "C-011": failing("readback_error"),
      "C-012": failing("ocr_error"),
      "C-013": failing("setup_error"),
      "C-014": failing("extraction_error"),
      "C-015": failing("zero_rows"),
      "C-016": failing("truncated"),
      "C-017": entryOf(),
    };
    const next = updateBaseline({
      baseline: {},
      entries,
      exploratory: false,
      interrupted: false,
    });
    expect(Object.keys(next).sort()).toEqual([
      "C-014",
      "C-015",
      "C-016",
      "C-017",
    ]);
    expect(runnerFailedCases(entries)).toEqual([
      { id: "C-010", modes: ["approve_error"] },
      { id: "C-011", modes: ["readback_error"] },
      { id: "C-012", modes: ["ocr_error"] },
      { id: "C-013", modes: ["setup_error"] },
    ]);
  });

  it("keeps the earlier baseline entry of a case that now fails on the runner side", () => {
    const next = updateBaseline({
      baseline: { "C-010": entryOf({ commit: "old" }) },
      entries: {
        "C-010": entryOf({
          verdict: verdict({
            failureModes: { ...verdict().failureModes, approve_error: 3 },
          }),
        }),
      },
      exploratory: false,
      interrupted: false,
    });
    expect(next["C-010"].commit).toBe("old");
  });
});
