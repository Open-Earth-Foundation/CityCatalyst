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
  caseCostUsd,
  caseMetrics,
  caseUsage,
  costUsd,
  totalUsage,
  appendIndexLine,
  INDEX_HEADER,
  renderIndexLine,
  renderBaselineChange,
  pipelineCostUsd,
  pricesFor,
  renderReport,
  runCostUsd,
  rescoredRunFlags,
  reserveRunFolder,
  runFolderName,
  writeRunArtifact,
  type CaseResult,
  type PipelineAttempt,
  type Prices,
  type RunSummary,
} from "@/backend/ingestion-benchmark/report";
import type { ReadEnvelope } from "@/backend/ingestion-benchmark/pipelines/rows-dir";
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
    rowPrecision: 0.5,
    valueAccuracy: 0.8,
    classificationAccuracy: 0.9,
    notationScored: 4,
    notationRecovered: 1,
    distractorsStored: 0,
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
      setup_error: 0,
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
    headlineRecallCases: 1,
    recallScoredOnly: 0.7,
    recallScoredOnlyCases: 1,
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

describe("spec 5.4 metrics", () => {
  it("per-case table shows precision, accuracies, notation keys and distractors", () => {
    const r = result("A", 0.5);
    const v = {
      ...verdict(r),
      rowPrecision: 0.25,
      valueAccuracy: 0.8,
      classificationAccuracy: 0.9,
      notationScored: 4,
      notationRecovered: 1,
      distractorsStored: 2,
    };
    const report = renderReport(summary([r]), [v], [block({})], []);
    expect(report).toContain(
      "| Precision | Value acc. | Class. acc. | Notation keys | Distractors stored |",
    );
    expect(report).toContain("| 25% | 80% | 90% | 1/4 | 2 |");
  });

  it("block section shows precision, accuracies, notation keys and distractors", () => {
    const a = result("A", 0.5);
    const b = result("B", 0.5);
    b.runs[0].score = score({
      rowPrecision: 1,
      valueAccuracy: 0.6,
      classificationAccuracy: 0.5,
    });
    const verdicts = [a, b].map((r, i) => ({
      ...verdict(r),
      notationScored: 4,
      notationRecovered: i + 1,
      distractorsStored: i,
    }));
    const report = renderReport(summary([a, b]), verdicts, [block({})], []);
    expect(report).toContain(
      "- Precision 75%, value accuracy 70%, classification accuracy 70% (means over 2 cases scored row by row, scored attempts only)",
    );
    expect(report).toContain(
      "- Notation keys recovered: 3 of 8; cases that stored a distractor value: 1",
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
      block({
        headlineRecall: 0.68,
        headlineRecallCases: 7,
        casesTotalWithinTolerance: 4,
      }),
    ]);
    expect(report).toContain(
      "Headline recall (failed attempts count as 0): 68% (7 cases counted; total-only cases have no row recall); cases with totals within tolerance: 4",
    );
    expect(report).toContain(
      "Recall over scored attempts only: 70% (1 case counted)",
    );
  });

  it("says why the headline is n/a when no case has a row recall", () => {
    const report = render(summary([result("A", 0.5)]), [
      block({
        headlineRecall: null,
        headlineRecallCases: 0,
        recallScoredOnly: null,
        recallScoredOnlyCases: 0,
      }),
    ]);
    expect(report).toContain(
      "Headline recall (failed attempts count as 0): n/a (0 cases counted; only eligible cases with row recall count)",
    );
    expect(report).toContain(
      "Recall over scored attempts only: n/a (0 cases counted)",
    );
  });

  it("notes cases left out of the baseline and held rows included at approve", () => {
    const s = summary([result("C-017", 0.5), result("C-018", 0.5)]);
    s.baselineNotRecorded = [{ id: "C-017", modes: ["approve_error"] }];
    s.results[1].runs[0].heldRowsIncluded = 4;
    const report = render(s);
    expect(report).toContain(
      "- Not recorded in the baseline: C-017 (approve_error)",
    );
    expect(report).toContain(
      "- Held rows included automatically at approve, whatever their issue (scores measure extraction, not a reviewed import): C-018 (4)",
    );
  });

  it("legacy tolerance cases are listed in notes", () => {
    const legacy = result("C-007", 0.5);
    legacy.runs[0].score = score({ toleranceSource: "legacy" });
    const modern = result("C-008", 0.5);
    modern.runs[0].score = score({ toleranceSource: "rule" });
    legacy.textTables = true;
    modern.textTables = false;
    // Unknown text tables: listed. A total-only case is not scored on rows, so it is not.
    const unknown = { ...result("C-009", 0.5), textTables: null };
    const totalOnly = {
      ...result("C-022", 0.5),
      eligible: null,
      totalOnly: true,
      textTables: null,
    };
    const known = { ...result("C-010", 0.5), eligible: null, textTables: true };
    const report = render(summary([legacy, modern, unknown, totalOnly, known]));
    expect(report).toContain("Cases using the legacy tolerance: C-007");
    expect(report).toContain("- Cases where `textTables` is unknown: C-009\n");
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
    expect(line).not.toContain("MLflow");
  });

  it("links the MLflow run from the INDEX line when it was logged", () => {
    const s = {
      ...summary([result("A", 0.5)]),
      mlflowRunUrl: "https://mlflow.example/#/experiments/1/runs/abc",
    };
    const line = renderIndexLine(s, [block({})], "folder");
    expect(line).toContain(
      "[folder](./folder/report.md) · [MLflow](https://mlflow.example/#/experiments/1/runs/abc) |",
    );
  });

  it("escapes backslashes before pipes in table cells", () => {
    const gate: CaseGate = {
      id: "A",
      verdict: "error",
      reasons: [String.raw`path C:\runs\out | y and a\|b`],
      costUsd: null,
      forecastUsd: null,
      lines: [],
    };
    const report = render(summary([result("A", 0.5)]), [block({})], [gate]);
    // Each backslash doubled, each pipe escaped: the cell cannot be split or unescaped.
    expect(report).toContain(
      String.raw`| A | error | path C:\\runs\\out \| y and a\\\|b |`,
    );
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

  it("finds the header in a CRLF index and does not add a second one", () => {
    const path = join(tmp(), "INDEX.md");
    writeFileSync(path, `${INDEX_HEADER}| old |\n`.replace(/\n/g, "\r\n"));
    appendIndexLine(path, "| new |");
    const text = readFileSync(path, "utf8");
    expect(text.split("| Run (UTC) |")).toHaveLength(2);
    expect(text).not.toContain("\r");
    expect(text.endsWith("| old |\n| new |\n")).toBe(true);
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

  it("adds a slugged pipeline study to the folder name", () => {
    expect(
      runFolderName("2026-10-27T15:30:00.000Z", "abc1234", " Mistral/OCR 3! "),
    ).toBe("2026-10-27-1530-abc1234-mistral-ocr-3");
    expect(runFolderName("2026-10-27T15:30:00.000Z", "abc1234", null)).toBe(
      "2026-10-27-1530-abc1234",
    );
  });

  it("never reuses a run folder: it appends -2, -3", () => {
    const outRoot = tmp();
    const at = "2026-10-27T15:30:00.000Z";
    expect(reserveRunFolder(outRoot, at, "abc1234")).toBe(
      "2026-10-27-1530-abc1234",
    );
    expect(reserveRunFolder(outRoot, at, "abc1234")).toBe(
      "2026-10-27-1530-abc1234-2",
    );
    expect(reserveRunFolder(outRoot, at, "abc1234")).toBe(
      "2026-10-27-1530-abc1234-3",
    );
    expect(reserveRunFolder(outRoot, at, "abc1234", "pipe")).toBe(
      "2026-10-27-1530-abc1234-pipe",
    );
  });

  it("two runs in the same minute write two folders", () => {
    const outRoot = tmp();
    const r = result("A", 0.5);
    const write = () =>
      writeRunArtifact({
        outRoot,
        summary: summary([r]),
        verdicts: [verdict(r)],
        blocks: [block({})],
        gates: [],
      });
    const first = write();
    const second = write();
    expect(second).not.toBe(first);
    expect(second).toBe(`${first}-2`);
    expect(existsSync(join(first, "report.md"))).toBe(true);
    expect(existsSync(join(second, "report.md"))).toBe(true);
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

  it("writes no answer-key content to results.json or report.md", () => {
    const outRoot = tmp();
    const r = result("A", 0.5);
    r.runs[0].score = score({
      expectedTotal: 987654.321,
      totalDiffPct: 42.4242,
      missingRows: [
        { description: "SECRET key row", gpc: "I.4.1", value: 4321.5 },
      ],
      distractorsStored: [
        {
          valueT: 777,
          gpc: "I.1.1",
          what: "SECRET distractor",
          failureMode: "wrong year",
        },
      ],
      unexpectedStored: [{ gpc: "I.2.1", scope: "1", valueT: 55 }],
    });
    const dir = writeRunArtifact({
      outRoot,
      summary: summary([r]),
      verdicts: [verdict(r)],
      blocks: [block({})],
      gates: [],
    });
    for (const file of ["results.json", "report.md"]) {
      const text = readFileSync(join(dir, file), "utf8");
      for (const needle of [
        "SECRET",
        "987654",
        "42.4242",
        "4321.5",
        "missingRows",
        "expectedTotal",
        "totalDiffPct",
      ]) {
        expect(text).not.toContain(needle);
      }
    }
    const results = JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
    expect(results.results[0].runs[0].score).toMatchObject({
      missingRowCount: 1,
      distractorsStoredCount: 1,
      unexpectedStoredCount: 1,
      rowRecall: 0.5,
      totalWithinTolerance: false,
    });
    // In memory the full score stays available to the gates and the report.
    expect(r.runs[0].score?.missingRows).toHaveLength(1);
  });
});

describe("change from the baseline and incomplete runs", () => {
  const base = (id: string, recall: number, passed: number): CaseVerdict => ({
    ...verdict(result(id, recall)),
    id,
    block: "validated",
    eligible: true,
    attempts: 3,
    attemptsPassed: passed,
    recallFailedAsZero: recall,
  });
  const gateFor = (id: string, baseline: CaseVerdict | null): CaseGate => ({
    id,
    verdict: "ok",
    reasons: [],
    costUsd: null,
    forecastUsd: null,
    lines: [],
    baseline,
  });

  it("shows baseline, now and the difference per block and per case", () => {
    const now = [base("C-004", 0.8, 3), base("C-005", 0.4, 1)];
    const lines = renderBaselineChange(now, [
      gateFor("C-004", base("C-004", 0.7, 2)),
      gateFor("C-005", base("C-005", 0.5, 2)),
    ]).join("\n");
    expect(lines).toContain("## Change from the baseline");
    expect(lines).toContain("### validated (2 cases with a baseline)");
    // Headline recall: (0.7 + 0.5) / 2 = 60% before, (0.8 + 0.4) / 2 = 60% now.
    expect(lines).toContain("| Headline recall | 60% | 60% | +0 pts |");
    expect(lines).toContain("| Attempts passing | 67% | 67% | +0 pts |");
    expect(lines).toContain(
      "| C-004 | validated | 70% | 80% | +10 pts | 2/3 / 3/3 | ok |",
    );
    expect(lines).toContain(
      "| C-005 | validated | 50% | 40% | -10 pts | 2/3 / 1/3 | ok |",
    );
  });

  it("says when no case has a baseline", () => {
    expect(
      renderBaselineChange(
        [base("C-004", 0.8, 3)],
        [gateFor("C-004", null)],
      ).join("\n"),
    ).toContain("No case in this run has a baseline");
  });

  it("marks an incomplete full-set run in the title and lists what is missing", () => {
    const s = {
      ...summary([]),
      incomplete: {
        missing: [{ id: "C-004", reason: "PDF not found in pdfDir" }],
        unfinished: ["C-010"],
      },
    };
    const report = render(s, []);
    expect(report).toContain(" - INCOMPLETE");
    expect(report).toContain("C-004 (PDF not found in pdfDir)");
    expect(report).toContain("Did not finish every attempt: C-010");
    expect(renderIndexLine(s, [], "f")).toContain("(incomplete)");
  });
});

const GOLDEN = join(
  process.cwd(),
  "tests",
  "backend",
  "ingestion-benchmark",
  "fixtures",
  "builtin-report.golden.md",
);

const pipelineInfo = {
  id: "precomputed",
  study: "study-a",
  stage: "stage-2",
  mode: "batch",
  version: "v3",
};

const pipelineAttempt = (partial: Partial<PipelineAttempt> = {}) => ({
  executionStatus: "ok",
  rowsInEnvelope: 12,
  unknownRowRoles: { mystery: 2 },
  droppedRows: { no_value: 1 },
  rowRoles: { value: 9 },
  scopeBasis: { stated: 7, inferred: 2 },
  totalInclusion: { included: 9 },
  reported: {
    totalT: 5000,
    grossT: 5200,
    netT: 4800,
    removalsT: 400,
    totalBasis: "gpc",
    totalKind: "net",
  },
  costUsd: 0.25,
  costSource: "envelope" as const,
  usage: {},
  lostRows: { "gpc-reference-unknown": 3, unexplained: 1 },
  ...partial,
});

const pipelineSummary = (): RunSummary => {
  const r = result("A", 0.8);
  r.runs[0] = { ...r.runs[0], pipeline: pipelineAttempt() };
  return {
    ...summary([r]),
    exploratory: true,
    exploratoryReason: "pipeline",
    pipeline: pipelineInfo,
  };
};

describe("built-in report is unchanged without a pipeline", () => {
  it("matches the report written before CC-1295", () => {
    const s = {
      ...summary([result("A", 0.8)]),
      extractionModel: "gpt-x",
      reasoningEffort: null,
      incomplete: {
        missing: [{ id: "C-004", reason: "PDF not found in pdfDir" }],
        unfinished: ["C-010"],
      },
    } as RunSummary;
    const out = [
      render(s),
      "---INDEX---",
      renderIndexLine(s, [block({})], "f"),
    ].join(String.fromCharCode(10));
    const golden = readFileSync(GOLDEN, "utf8")
      .split(String.fromCharCode(13))
      .join("");
    expect(out).toBe(golden);
  });
});

describe("precomputed pipeline report", () => {
  it("names the pipeline and does not claim a built-in model, prompt or input", () => {
    const report = render(pipelineSummary());
    expect(report).toContain(
      "- Pipeline: precomputed (study-a/stage-2, batch v3)",
    );
    expect(report).toContain("- Exploratory: pipeline");
    expect(report).toContain("(exploratory)");
    expect(report).toContain("- Extraction model: n/a (precomputed pipeline)");
    expect(report).toContain("- Prompt hash: n/a (precomputed pipeline)");
    expect(report).toContain(
      "- Input representation: n/a (precomputed pipeline)",
    );
    expect(report).not.toContain("hash123");
    expect(report).not.toContain("ocr-text");
    expect(report).not.toContain("OCR model");
  });

  it("keeps the estimated cost line above the pipeline notes", () => {
    const report = render(pipelineSummary());
    expect(report.indexOf("Estimated cost of this run")).toBeGreaterThan(
      report.indexOf("## Per case"),
    );
    expect(report.indexOf("Estimated cost of this run")).toBeLessThan(
      report.indexOf("## Pipeline notes"),
    );
    expect(report.indexOf("## Pipeline notes")).toBeLessThan(
      report.indexOf("## Notes"),
    );
  });

  it("escapes the pipeline names in the INDEX line", () => {
    const s = {
      ...pipelineSummary(),
      pipeline: { ...pipelineInfo, study: "a|b" },
    };
    expect(renderIndexLine(s, [block({})], "f")).toContain(
      "pipeline=precomputed:a\\|b",
    );
  });

  it("puts the pipeline in the INDEX line", () => {
    expect(renderIndexLine(pipelineSummary(), [block({})], "f")).toContain(
      "pipeline=precomputed:study-a",
    );
  });

  it("lists pipeline notes per case, unscored, with lost rows", () => {
    const report = render(pipelineSummary());
    const notes = report.slice(report.indexOf("## Pipeline notes"));
    expect(notes).toContain("| A | 1 |");
    expect(notes).toContain("mystery 2");
    expect(notes).toContain("no_value 1");
    expect(notes).toContain("gpc-reference-unknown 3, unexplained 1");
    expect(notes).toContain("stated 7, inferred 2");
    expect(notes).toContain("total 5000");
    expect(notes).toContain("gross 5200");
    expect(notes).toContain("net 4800");
    expect(notes).toContain("removals 400");
    expect(notes).toContain("gpc");
    expect(notes).toContain("$0.250");
  });

  it("has no pipeline notes section for a built-in run", () => {
    expect(render(summary([result("A", 0.8)]))).not.toContain("Pipeline notes");
  });

  it("words the incomplete text as no envelope for a precomputed run", () => {
    const s = {
      ...pipelineSummary(),
      incomplete: {
        missing: [
          { id: "C-004", reason: "no envelope in the rows folder" },
          { id: "C-005", reason: "PDF not found in pdfDir" },
        ],
        unfinished: [],
      },
    };
    const report = render(s);
    expect(report).toContain("No envelope in the rows folder: C-004");
    expect(report).toContain("Missing inputs (not run): C-005");
    expect(report).not.toContain("C-004 (no envelope");
  });
});

describe("rescore of a pipeline run", () => {
  it("keeps the pipeline and stays exploratory", () => {
    const old = {
      ...pipelineSummary(),
      measuredAt: "2026-11-01T00:00:00.000Z",
      commit: "old1234",
    };
    expect(rescoredRunFlags(old)).toEqual({
      exploratory: true,
      exploratoryReason: "pipeline",
      pipeline: pipelineInfo,
    });
    expect(rescoredRunFlags({ ...old, runsPerFile: 3 }).exploratory).toBe(true);
  });

  it("keeps the old attempts rule for a built-in run", () => {
    const old = { ...summary([]), runsPerFile: 1 };
    // A built-in run writes no exploratoryReason, as before.
    expect(rescoredRunFlags(old)).toEqual({ exploratory: true });
    expect(rescoredRunFlags({ ...old, runsPerFile: 3 })).toEqual({
      exploratory: false,
    });
  });
});

describe("pipeline cost", () => {
  // A fixture price, not a real one.
  const prices: Prices = {
    models: {
      "fixture/model": {
        inputPerMTok: 1,
        cachedInputPerMTok: 0.1,
        outputPerMTok: 4,
        source: "https://example.test/prices",
        date: "2026-11-18",
      },
    },
  };
  const envelope = (
    over: Partial<Pick<ReadEnvelope, "costUsd" | "usage">> = {},
    version: string | null = "fixture/model",
  ) => ({
    costUsd: null,
    usage: {
      input_tokens: 2_000_000,
      "input_tokens_details.cached_tokens": 1_000_000,
      output_tokens: 500_000,
    },
    info: { ...pipelineInfo, version },
    ...over,
  });

  it("takes the envelope's own cost first", () => {
    expect(pipelineCostUsd(envelope({ costUsd: 0.42 }), prices)).toEqual({
      costUsd: 0.42,
      costSource: "envelope",
    });
  });

  it("prices the tokens with the model named by the envelope version, cached input at its own price", () => {
    const cost = pipelineCostUsd(envelope(), prices);
    expect(cost.costSource).toBe("tokens");
    expect(cost.costUsd).toBeCloseTo(1 * 1 + 1 * 0.1 + 0.5 * 4);
  });

  it("prices the tokens of a model named in the usage keys", () => {
    const cost = pipelineCostUsd(
      envelope(
        {
          usage: {
            "fixture/model.input_tokens": 1_000_000,
            "fixture/model.output_tokens": 1_000_000,
          },
        },
        null,
      ),
      prices,
    );
    expect(cost).toEqual({ costUsd: 5, costSource: "tokens" });
  });

  it("gives no cost without a price for the model or without token counts", () => {
    const none = { costUsd: null, costSource: "none" };
    expect(pipelineCostUsd(envelope({}, "other/model"), prices)).toEqual(none);
    expect(pipelineCostUsd(envelope({}, null), prices)).toEqual(none);
    expect(pipelineCostUsd(envelope(), {})).toEqual(none);
    expect(pipelineCostUsd(envelope(), undefined)).toEqual(none);
    expect(
      pipelineCostUsd(envelope({ usage: { input_tokens: 5 } }), prices),
    ).toEqual(none);
  });

  it("keeps the built-in prices of prices.json and gives a pipeline run only its models", () => {
    const file = {
      "openai/gpt-x": {
        llmInputPerMTok: 1,
        llmOutputPerMTok: 2,
        ocrPerPage: 3,
      },
      models: prices.models,
    };
    expect(pricesFor(file, { pipeline: false, model: "openai/gpt-x" })).toBe(
      file["openai/gpt-x"],
    );
    expect(pricesFor(file, { pipeline: false })).toBeUndefined();
    expect(pricesFor(file, { pipeline: true, model: "openai/gpt-x" })).toEqual({
      models: prices.models,
    });
    expect(pricesFor({}, { pipeline: true })).toEqual({
      models: {},
    });
  });

  it("sums the envelope costs of a pipeline case, and gives n/a when one is unknown", () => {
    const priced = pipelineSummary().results[0];
    const twice = {
      ...priced,
      runs: [priced.runs[0], { ...priced.runs[0], run: 2 }],
    };
    expect(caseCostUsd(twice, undefined)).toBeCloseTo(0.5);
    const unknown = {
      ...twice,
      runs: [
        twice.runs[0],
        {
          ...twice.runs[1],
          pipeline: pipelineAttempt({ costUsd: null, costSource: "none" }),
        },
      ],
    };
    expect(caseCostUsd(unknown, undefined)).toBeNull();
    // A built-in case keeps its OCR and LLM cost.
    expect(caseCostUsd(result("B", 0.5), undefined)).toBeNull();
  });

  it("renders the run cost of a pipeline run from its envelopes", () => {
    const s = pipelineSummary();
    expect(render(s)).toContain("Estimated cost of this run: $0.250");
    expect(renderIndexLine(s, [block({})], "f")).toContain("| $0.250 |");
  });

  it("shows n/a, not $0.000, for a pipeline run without any envelope cost", () => {
    const s = pipelineSummary();
    s.results[0].runs[0].pipeline = undefined;
    expect(runCostUsd(s)).toBeNull();
    expect(render(s)).toContain("Estimated cost of this run: n/a");
  });

  it("shows envelope tokens per case, or n/a without them", () => {
    const s = pipelineSummary();
    expect(render(s)).toContain("| n/a | ");
    s.results[0].runs[0].pipeline = pipelineAttempt({
      usage: { input_tokens: 12_000, output_tokens: 3_000 },
    });
    const report = render(s);
    expect(report).toContain("| 12k / 3k |");
    expect(report).not.toContain("0k / 0k");
  });

  it("truncates a long total basis in the report only", () => {
    const s = pipelineSummary();
    const long = "x".repeat(500);
    s.results[0].runs[0].pipeline = pipelineAttempt({
      reported: { ...pipelineAttempt().reported, totalBasis: long },
    });
    const report = render(s);
    expect(report).not.toContain(long);
    expect(report).toContain(`${"x".repeat(200)}...`);
    expect(s.results[0].runs[0].pipeline?.reported.totalBasis).toBe(long);
  });

  it("shows n/a for a pipeline attempt without a price", () => {
    const s = pipelineSummary();
    s.results[0].runs[0].pipeline = pipelineAttempt({
      costUsd: null,
      costSource: "none",
    });
    const report = render(s);
    expect(report).toContain("| n/a (none) |");
    expect(report).toContain("Estimated cost of this run: n/a");
  });
});

describe("parent-reference score variant", () => {
  const variantSummary = (): RunSummary => {
    const s = pipelineSummary();
    const run = s.results[0].runs[0];
    s.results[0].runs[0] = {
      ...run,
      pipeline: {
        ...run.pipeline!,
        parentRefRows: [
          { gpc: "I.3", scope: null, valueT: 40, omit: false, notation: null },
        ],
        parentRefOverlap: 1,
        variantScore: score({
          rowRecall: 0.9,
          rowPrecision: 0.95,
          totalWithinTolerance: true,
        }),
      },
    };
    return s;
  };
  const section = (report: string) =>
    report.slice(
      report.indexOf("## Score variant"),
      report.indexOf("## Notes"),
    );

  it("shows both scores per block, standard first and labelled, the variant labelled parent refs (Mirco)", () => {
    const text = section(render(variantSummary()));
    expect(text).toContain(
      "| Block | Headline recall: standard | Headline recall: parent refs (Mirco) | Precision: standard | Precision: parent refs (Mirco) |",
    );
    expect(text).toContain("| validated | 68% | 90% | 50% | 95% |");
  });

  it("shows both scores per case, standard first", () => {
    const text = section(render(variantSummary()));
    expect(text).toContain(
      "| Case | Block | Recall: standard | Recall: parent refs (Mirco) | Precision: standard | Precision: parent refs (Mirco) | Totals within tolerance: standard | Totals within tolerance: parent refs (Mirco) | Parent-reference rows added | Of which children were stored too |",
    );
    expect(text).toContain(
      "| A | validated | 50% | 90% | 50% | 95% | no | yes | 1 | 1 |",
    );
  });

  it("warns that the variant counts a parent twice when its children were stored too", () => {
    expect(section(render(variantSummary()))).toContain(
      "When the pipeline also gave the children of a parent reference and approve stored them, the variant counts that amount twice (see the last column); the standard score is unaffected.",
    );
  });

  it("says the standard score stays the headline", () => {
    const report = render(variantSummary());
    expect(section(report)).toContain("The standard score is the headline");
    expect(report.indexOf("## Pipeline notes")).toBeLessThan(
      report.indexOf("## Score variant"),
    );
  });

  it("shows n/a for a scored attempt without a variant score", () => {
    const text = section(render(pipelineSummary()));
    expect(text).toContain("| validated | 68% | n/a | 50% | n/a |");
    expect(text).toContain(
      "| A | validated | 50% | n/a | 50% | n/a | no | n/a | 0 | 0 |",
    );
  });

  it("has no variant section for a built-in run", () => {
    expect(render(summary([result("A", 0.8)]))).not.toContain("Score variant");
  });
});
