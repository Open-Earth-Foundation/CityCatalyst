import { afterEach, describe, expect, it } from "@jest/globals";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";
import { compareWithBaseline } from "@/backend/ingestion-benchmark/baseline";
import { caseVerdict } from "@/backend/ingestion-benchmark/metrics";
import {
  publishableSummary,
  redactScore,
} from "@/backend/ingestion-benchmark/redact";
import type {
  CaseResult,
  RunEntry,
  RunSummary,
} from "@/backend/ingestion-benchmark/report";
import { rescoreCase } from "@/backend/ingestion-benchmark/rescore";
import {
  scoreFile,
  type StoredValue,
} from "@/backend/ingestion-benchmark/score";
import {
  redactReportText,
  redactResultsText,
} from "../../../scripts/pdf-benchmark/redact-results";

/** Answer-key content that must never be written to results.json or sent to MLflow. */
const KEY_ROW_TEXT = "SECRET key row description";
const DISTRACTOR_TEXT = "SECRET distractor text";
const EXPECTED_TOTAL = 987654.321;

const key: KeyFile = {
  id: "T-001",
  city: "Test",
  country: "Testland",
  year: 2021,
  fileName: "test.pdf",
  expectedTotal: EXPECTED_TOTAL,
  toleranceText: "±1 t",
  tolerance: 1,
  totalTolerance: 1,
  keyValueRows: 2,
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
    {
      row: 2,
      description: KEY_ROW_TEXT,
      year: 2021,
      value: 4321.5,
      gpc: "II.1.1",
      scope: "1",
      ambiguous: false,
      rowType: "Value",
      notation: "",
      scored: true,
      note: "",
    },
  ],
  distractors: [
    {
      where: "page 1",
      what: DISTRACTOR_TEXT,
      examples: "",
      numbers: [777],
      failureMode: "wrong year",
    },
  ],
};

const stored: StoredValue[] = [
  { gpc: "I.1.1", scope: "1", valueT: 100, omit: false, notation: null },
  { gpc: "I.2.1", scope: "1", valueT: 777, omit: false, notation: null },
  { gpc: "I.3.1", scope: "1", valueT: 55, omit: false, notation: null },
];

const run = (n: number, partial: Partial<RunEntry> = {}): RunEntry => ({
  run: n,
  failureMode: "scored",
  warnings: [],
  stageMs: { ocr: null, extraction: null, import: null, total: 1000 },
  ok: true,
  ms: 1000,
  stored,
  total: 932,
  score: scoreFile(key, stored),
  ...partial,
});

const caseResult = (): CaseResult => ({
  id: "T-001",
  file: "test.pdf",
  kind: "pdf",
  targetYear: 2021,
  keyId: "T-001",
  ocr: { ok: true, code: null },
  productFlowFailsAtOcr: false,
  // The truncated attempt keeps stored values and a score: it must rescore too.
  runs: [run(1), run(2), run(3, { failureMode: "truncated", ok: false })],
  stableTotal: true,
  block: "validated",
  eligible: true,
  totalOnly: false,
});

const summaryOf = (results: CaseResult[]): RunSummary => ({
  measuredAt: "2026-11-01T00:00:00.000Z",
  commit: "abc1234",
  branch: "b",
  runsPerFile: 3,
  results,
  selection: results.map((r) => r.id),
  exploratory: false,
  interrupted: false,
  promptHash: null,
  inputRepresentation: null,
  testSetVersion: "v1",
  dirty: false,
  mlflowRunUrl: null,
  mlflowNote: null,
});

const leaks = (text: string) =>
  [
    KEY_ROW_TEXT,
    DISTRACTOR_TEXT,
    String(EXPECTED_TOTAL),
    "4321.5",
    "missingRows",
    "expectedTotal",
    "totalDiffPct",
    'distractorsStored"',
    'unexpectedStored"',
  ].filter((needle) => text.includes(needle));

describe("redactScore", () => {
  it("keeps counts and ratios and drops answer-key content", () => {
    const full = scoreFile(key, stored);
    expect(full.missingRows).toHaveLength(1);
    expect(full.distractorsStored).toHaveLength(1);
    const redacted = redactScore(full);
    expect(leaks(JSON.stringify(redacted))).toEqual([]);
    expect(redacted).toMatchObject({
      missingRowCount: 1,
      distractorsStoredCount: 1,
      unexpectedStoredCount: 2,
      rowRecall: full.rowRecall,
      matchedRows: full.matchedRows,
      storedTotal: full.storedTotal,
      totalWithinTolerance: full.totalWithinTolerance,
      notationScored: 0,
    });
  });

  it("is idempotent", () => {
    const once = redactScore(scoreFile(key, stored));
    expect(redactScore(once)).toEqual(once);
  });
});

describe("publishableSummary", () => {
  it("redacts every score and the legacy fields, and leaves the input untouched", () => {
    const legacyRun = { ...run(1), totalDiffPct: 12.5 };
    const input = {
      ...summaryOf([
        { ...caseResult(), reference: EXPECTED_TOTAL, runs: [legacyRun] },
      ] as unknown as CaseResult[]),
      verdicts: [],
    };
    const before = JSON.stringify(input);
    const out = publishableSummary(input);
    expect(leaks(JSON.stringify(out))).toEqual([]);
    expect(JSON.stringify(input)).toBe(before);
    expect(out.results[0].runs[0].stored).toEqual(stored);
  });

  it("accepts a file without results", () => {
    expect(publishableSummary({})).toEqual({});
  });
});

describe("redact-results script", () => {
  it("rewrites a results.json without answer-key content", () => {
    const text = `${JSON.stringify(summaryOf([caseResult()]), null, 2)}\n`;
    const out = redactResultsText(text);
    expect(leaks(out)).toEqual([]);
    expect(out.endsWith("}\n")).toBe(true);
    expect(redactResultsText(out)).toBe(out);
  });

  it("removes diffs against the expected total and missing key rows from a report", () => {
    const report = [
      "| Case | Total vs key | Stable |",
      "| C-004 | +31655979.4% (outside tolerance) | no |",
      "| C-008 | -0.0% (within tolerance) | yes |",
      "",
      "## Lowest recall: what is missing",
      "",
      "### C-004 (0% recall)",
      "",
      `- I.8.1: ${KEY_ROW_TEXT} (4321.5 t)`,
      "",
      "## Files in this folder",
      "",
      "- `results.json`",
      "",
    ].join("\n");
    const out = redactReportText(report);
    expect(out).toContain("| C-004 | outside tolerance | no |");
    expect(out).toContain("| C-008 | within tolerance | yes |");
    expect(out).not.toContain(KEY_ROW_TEXT);
    expect(out).not.toContain("Lowest recall");
    expect(out).toContain("## Files in this folder");
    // Windows checkouts have CRLF line ends.
    const crlf = redactReportText(report.replace(/\n/g, "\r\n"));
    expect(crlf).not.toContain(KEY_ROW_TEXT);
    expect(crlf).toContain("## Files in this folder");
  });
});

describe("comparisons from a redacted results.json", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("rescore and baseline compare give the same verdict as from the full file", () => {
    dir = mkdtempSync(join(tmpdir(), "redact-"));
    const full = summaryOf([caseResult()]);
    const redacted = publishableSummary(full);
    for (const [folder, content] of [
      ["full", full],
      ["redacted", redacted],
    ] as const) {
      mkdirSync(join(dir, folder), { recursive: true });
      writeFileSync(join(dir, folder, "results.json"), JSON.stringify(content));
    }
    const fromFull = caseVerdict(rescoreCase(full.results[0], key), key);
    const fromRedacted = caseVerdict(
      rescoreCase(redacted.results[0], key),
      key,
    );
    expect(fromRedacted).toEqual(fromFull);
    expect(fromFull.attempts).toBe(3);

    const compare = (runFolder: string) =>
      compareWithBaseline({
        id: "T-001",
        current: fromFull,
        currentVersion: "new",
        baseline: {
          "T-001": {
            verdict: fromFull,
            commit: "abc",
            extractionModel: null,
            ocrModel: null,
            promptHash: null,
            testSetVersion: "old",
            runFolder,
            date: "2026-11-01",
          },
        },
        key,
        runsRoot: dir,
      });
    const a = compare("full");
    const b = compare("redacted");
    expect(a.status).toBe("compared");
    expect(b).toEqual(a);
  });
});
