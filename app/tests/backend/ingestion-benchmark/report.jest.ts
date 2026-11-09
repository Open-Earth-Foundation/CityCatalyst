import { afterEach, describe, expect, it } from "@jest/globals";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregate,
  caseMetrics,
  caseUsage,
  costUsd,
  groupSummary,
  totalUsage,
  appendIndexLine,
  INDEX_HEADER,
  renderIndexLine,
  renderReport,
  runFolderName,
  writeRunArtifact,
  type CaseResult,
  type RunSummary,
} from "@/backend/ingestion-benchmark/report";
import type {
  BlockSummary,
  CaseVerdict,
} from "@/backend/ingestion-benchmark/metrics";
import type { CaseGate } from "@/backend/ingestion-benchmark/gate";
import type { FileScore } from "@/backend/ingestion-benchmark/score";

function score(partial: Partial<FileScore>): FileScore {
  return {
    keyValueRows: 10,
    storedGroups: 10,
    matchedRows: 5,
    rowRecall: 0.5,
    rowPrecision: 0.5,
    subsectorRecall: 0.5,
    valueAccuracy: 0.8,
    classificationAccuracy: 0.9,
    expectedTotal: 1000,
    storedTotal: 1100,
    totalDiffPct: 10,
    totalWithinTolerance: false,
    notationScored: 4,
    notationRecovered: 1,
    distractorsStored: [],
    unexpectedStored: [],
    missingRows: [{ description: "Gas", gpc: "I.4.1", value: 12 }],
    ...partial,
  };
}

function result(id: string, recall: number, ocrFails = false): CaseResult {
  return {
    id,
    file: `${id}.pdf`,
    kind: "pdf",
    targetYear: 2021,
    keyId: id,
    ocr: { ok: !ocrFails, code: ocrFails ? "malformed_response" : null },
    productFlowFailsAtOcr: ocrFails,
    stableTotal: true,
    block: "validated",
    eligible: true,
    totalOnly: false,
    runs: [
      {
        run: 1,
        failureMode: "scored" as const,
        warnings: [] as string[],
        stageMs: { ocr: null, extraction: null, import: null, total: 1 },
        ok: true,
        ms: 20_000,
        extractedRows: 10,
        stored: [],
        score: score({ rowRecall: recall }),
      },
    ],
  };
}

function summary(
  results: CaseResult[],
  measuredAt = "2026-10-27T15:30:00.000Z",
  commit = "abc1234",
): RunSummary {
  return {
    measuredAt,
    commit,
    branch: "test",
    llmModel: "m",
    ocrModel: "o",
    runsPerFile: 1,
    results,
    selection: results.map((r) => r.id),
    exploratory: false,
    interrupted: false,
    promptHash: "hash123",
    inputRepresentation: "ocr-text",
    testSetVersion: "tsv1",
    dirty: false,
    mlflowRunUrl: null,
    mlflowNote: null,
  };
}

function verdict(result: CaseResult): CaseVerdict {
  return {
    id: result.id,
    block: result.block,
    eligible: result.eligible,
    attempts: result.runs.length,
    attemptsPassed: 0,
    casePasses: false,
    exploratory: true,
    recallFailedAsZero: 0.5,
    recallScoredOnly: 0.5,
    totalWithinToleranceAll: false,
    tenXAttempts: 0,
    wrongTotalAttempts: 1,
    warnedWrongTotalAttempts: 0,
    failureModes: {
      scored: 1,
      ocr_error: 0,
      extraction_error: 0,
      truncated: 0,
      zero_rows: 0,
      approve_error: 0,
      readback_error: 0,
    },
    costUsd: null,
    seconds: 1,
  };
}

function block(partial: Partial<BlockSummary>): BlockSummary {
  return {
    block: "validated",
    casesInRun: 1,
    casesInManifest: 1,
    headlineRecall: 0.68,
    recallScoredOnly: 0.7,
    casesTotalWithinTolerance: 0,
    attemptPassShare: 0,
    tenXAttempts: 0,
    warningShare: null,
    ...partial,
  };
}

const render = (
  s: RunSummary,
  blocks: BlockSummary[] = [block({})],
  gates: CaseGate[] = [],
) => renderReport(s, s.results.map(verdict), blocks, gates);

describe("validated and held-out groups", () => {
  const failed = (id: string): CaseResult => ({
    ...result(id, 0),
    runs: [
      {
        run: 1,
        failureMode: "scored" as const,
        warnings: [] as string[],
        stageMs: { ocr: null, extraction: null, import: null, total: 1 },
        ok: false,
        ms: 1,
        extractedRows: 0,
        score: score({ rowRecall: 0, valueAccuracy: null }),
      },
    ],
  });

  it("counts failed runs only in the with-failed means", () => {
    const group = groupSummary([result("A", 0.8), failed("B")]);
    expect(group.rowRecall).toBeCloseTo(0.8);
    expect(group.rowRecallWithFailed).toBeCloseTo(0.4);
    expect(group.valueAccuracyWithFailed).toBeCloseTo(0.4);
  });

  it("counts a total as within tolerance only when every run is", () => {
    const within = score({ totalWithinTolerance: true });
    const outside = score({ totalWithinTolerance: false });
    const runs = (first: FileScore, second: FileScore) => [
      {
        run: 1,
        failureMode: "scored" as const,
        warnings: [] as string[],
        stageMs: { ocr: null, extraction: null, import: null, total: 1 },
        ok: true,
        ms: 1,
        score: first,
      },
      {
        run: 2,
        failureMode: "scored" as const,
        warnings: [] as string[],
        stageMs: { ocr: null, extraction: null, import: null, total: 1 },
        ok: true,
        ms: 1,
        score: second,
      },
    ];
    const group = groupSummary([
      { ...result("A", 0.5), runs: runs(within, within) },
      { ...result("B", 0.5), runs: runs(within, outside) },
      {
        ...result("C", 0.5),
        runs: runs(
          score({ expectedTotal: null, totalWithinTolerance: null }),
          score({ expectedTotal: null, totalWithinTolerance: null }),
        ),
      },
    ]);
    expect(group.totalCases).toBe(2);
    expect(group.totalCasesWithin).toBe(1);
    expect(group.totalRuns).toBe(4);
    expect(group.totalRunsWithin).toBe(3);
  });

  it("validated and held-out are separate sections and never merged", () => {
    const results = [result("A", 0.8), result("B", 0.4)];
    const split = render(summary(results), [
      block({ block: "validated", headlineRecall: 0.8 }),
      block({ block: "held-out", headlineRecall: 0.4 }),
    ]);
    expect(split).toContain("## Block: validated");
    expect(split).toContain("## Block: held-out");
    expect(split.indexOf("## Block: validated")).toBeLessThan(
      split.indexOf("## Block: held-out"),
    );
  });
});

describe("usage and cost", () => {
  const withUsage = (id: string, pages: number | null): CaseResult => ({
    ...result(id, 0.5),
    ocrUsage: { calls: 0, promptTokens: 0, completionTokens: 0, pages },
    runs: [
      {
        ...result(id, 0.5).runs[0],
        usage: { calls: 2, promptTokens: 1_000_000, completionTokens: 500_000 },
      },
      {
        ...result(id, 0.5).runs[0],
        run: 2,
        usage: { calls: 1, promptTokens: 1_000_000, completionTokens: 0 },
      },
    ],
  });
  const prices = { llmInputPerMTok: 1, llmOutputPerMTok: 4, ocrPerPage: 0.01 };

  it("sums OCR once and every run", () => {
    const usage = caseUsage(withUsage("A", 10));
    expect(usage.promptTokens).toBe(2_000_000);
    expect(usage.calls).toBe(3);
    expect(usage.ocrPages).toBe(10);
  });

  it("prices tokens and pages, and refuses to guess missing prices", () => {
    const usage = totalUsage([withUsage("A", 10), withUsage("B", 20)]);
    expect(costUsd(usage, prices)).toBeCloseTo(2 * (2 + 2) + 0.3);
    expect(costUsd(usage, { llmInputPerMTok: 1 })).toBeNull();
    expect(costUsd(usage)).toBeNull();
  });

  it("renders the cost of the run", () => {
    const run = summary([withUsage("A", null)]);
    run.prices = prices;
    const report = render(run);
    expect(report).toContain("Estimated cost of this run: $4.00");
  });
});

describe("report", () => {
  const dirs: string[] = [];
  const tmp = () => {
    const dir = mkdtempSync(join(tmpdir(), "ia-report-"));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  it("averages metrics over finished runs", () => {
    const failed = result("C-001", 0.4);
    failed.runs.push({ run: 2, ok: false, ms: 1000, message: "boom" });
    failed.runs.push({
      run: 3,
      ok: true,
      ms: 1000,
      score: score({ rowRecall: 0.8 }),
    });
    expect(caseMetrics(failed).rowRecall).toBeCloseTo(0.6);
  });

  it("aggregates across cases and counts OCR failures", () => {
    const total = aggregate([result("A", 0.2), result("B", 0.6, true)]);
    expect(total.cases).toBe(2);
    expect(total.ocrFailures).toBe(1);
    expect(total.rowRecall).toBeCloseTo(0.4);
  });

  it('partial block shows "3 of 22 cases in this run"', () => {
    const report = render(summary([result("A", 0.5)]), [
      block({ casesInRun: 3, casesInManifest: 22 }),
    ]);
    expect(report).toContain("3 of 22 cases in this run");
  });

  it("headline line shows recall next to totals within tolerance", () => {
    const report = render(summary([result("A", 0.5)]), [
      block({ headlineRecall: 0.68, casesTotalWithinTolerance: 4 }),
    ]);
    expect(report).toContain(
      "Headline recall (failed attempts count as 0): 68%; cases with totals within tolerance: 4",
    );
  });

  it("legacy tolerance cases are listed in notes", () => {
    const legacy = result("C-007", 0.5);
    legacy.runs[0].score = score({ toleranceSource: "legacy" });
    const modern = result("C-008", 0.5);
    modern.runs[0].score = score({ toleranceSource: "rule" });
    const unknown = { ...result("C-009", 0.5), eligible: null };
    const report = render(summary([legacy, modern, unknown]));
    expect(report).toContain("Cases using the legacy tolerance: C-007");
    expect(report).toContain("`textTables` is unknown: C-009");
    expect(report).toContain("C-028 and C-031 are not fully held out");
  });

  it("interrupted run shows INTERRUPTED in the header", () => {
    const report = render({
      ...summary([result("A", 0.5)]),
      interrupted: true,
    });
    expect(report.split(/\r?\n/)[0]).toContain("INTERRUPTED");
  });

  it("MLflow note shown when not logged", () => {
    const report = render({
      ...summary([result("A", 0.5)]),
      mlflowNote: "MLFLOW_TRACKING_URI not set",
    });
    expect(report).toContain("MLflow: MLFLOW_TRACKING_URI not set");
  });

  it("renders regressions, warnings and the index line", () => {
    const run = result("A", 0.5);
    run.runs[0].warnings = ["total looks off"];
    const gate: CaseGate = {
      id: "A",
      verdict: "regression",
      reasons: ["recall dropped 10 pts"],
      costUsd: null,
      forecastUsd: null,
      lines: [],
    };
    const s = summary([run]);
    const report = render(s, [block({})], [gate]);
    expect(report).toContain("| A | regression | recall dropped 10 pts |");
    expect(report).toContain("A: total looks off");
    const line = renderIndexLine(s, [block({})], "folder");
    expect(line).toContain("68%");
    expect(line).toContain("[folder](./folder/report.md)");
  });

  it("marks a rescore in the header and names the source run", () => {
    const rescoredFrom = {
      measuredAt: "2026-10-31T04:18:42.240Z",
      commit: "34131e4ec",
    };
    const s = { ...summary([result("A", 0.5)]), rescoredFrom };
    const report = render(s);
    expect(report.split("\n")[0]).toContain("(rescore)");
    expect(report).toContain(
      "Rescored from the run of 2026-10-31 04:18 UTC (`34131e4ec`)",
    );
    expect(renderIndexLine(s, [block({})], "folder")).toContain("(rescore)");
  });

  it("appends index lines under the new table, below earlier content", () => {
    const path = join(tmp(), "INDEX.md");
    const earlier = "# Runs\n\n## Earlier runs\n\n| a |\n| --- |\n| 1 |\n";
    writeFileSync(path, earlier);
    appendIndexLine(path, "| first |");
    appendIndexLine(path, "| second |");
    const text = readFileSync(path, "utf8");
    expect(text.startsWith(earlier)).toBe(true);
    expect(text.split(INDEX_HEADER)).toHaveLength(2);
    expect(text.indexOf("| first |")).toBeGreaterThan(
      text.indexOf(INDEX_HEADER),
    );
    expect(text.indexOf("| second |")).toBeGreaterThan(
      text.indexOf("| first |"),
    );
  });

  it("creates the index with the header when it does not exist", () => {
    const path = join(tmp(), "sub", "INDEX.md");
    appendIndexLine(path, "| only |");
    expect(readFileSync(path, "utf8")).toBe(`${INDEX_HEADER}| only |\n`);
  });

  it("names the folder from date, time and sha", () => {
    expect(runFolderName("2026-10-27T15:30:00.000Z", "abc1234")).toBe(
      "2026-10-27-1530-abc1234",
    );
  });

  it("writeRunArtifact writes no answer-key.json and no ocr text", () => {
    const outRoot = tmp();
    const r = result("A", 0.5);
    r.runs[0].stored = [{ gpc: "I.1.1" } as never];
    const s = summary([r]);
    const dir = writeRunArtifact({
      outRoot,
      summary: s,
      verdicts: [verdict(r)],
      blocks: [block({})],
      gates: [],
    });
    expect(dir).toBe(join(outRoot, "2026-10-27-1530-abc1234"));
    expect(existsSync(join(dir, "report.md"))).toBe(true);
    const results = JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
    expect(results.results[0].runs[0].stored).toEqual([{ gpc: "I.1.1" }]);
    expect(results.verdicts).toHaveLength(1);
    expect(results.blocks).toHaveLength(1);
    expect(
      JSON.parse(
        readFileSync(
          join(dir, "cases", "A", "attempt-1", "extracted-values.json"),
          "utf8",
        ),
      ),
    ).toEqual([{ gpc: "I.1.1" }]);
    const files = readdirSync(dir, { recursive: true }) as string[];
    expect(
      files.filter((f) => /answer-key|ocr|original|INDEX/i.test(f)),
    ).toEqual([]);
  });
});
