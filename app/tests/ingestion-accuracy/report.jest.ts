import { afterEach, describe, expect, it } from "@jest/globals";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregate,
  caseMetrics,
  caseUsage,
  costUsd,
  totalUsage,
  renderReport,
  runFolderName,
  writeRunArtifact,
  type CaseResult,
  type RunSummary,
} from "./report";
import type { FileScore } from "./score";

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
    runs: [
      {
        run: 1,
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
  };
}

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

  it("flags unknown OCR pages and renders the cost section", () => {
    const run = summary([withUsage("A", null)]);
    run.prices = prices;
    const report = renderReport(run, null);
    expect(report).toContain("## Cost of this run");
    expect(report).toContain("0+ pages");
    expect(report).toContain("Estimated cost: $4.00");
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
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
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

  it("renders the table and the change vs the previous run", () => {
    const previous = summary([result("A", 0.2)], "2026-10-26T10:00:00.000Z", "old1234");
    const report = renderReport(summary([result("A", 0.7)]), previous);
    expect(report).toContain("| A | A.pdf | ok |");
    expect(report).toContain("70% (+50 pts)");
    expect(report).toContain("Compared with: previous run `old1234`");
    expect(report).toContain("Missing rows (first run)");
  });

  it("names the folder from date, time and sha", () => {
    expect(runFolderName("2026-10-27T15:30:00.000Z", "abc1234")).toBe(
      "2026-10-27-1530-abc1234",
    );
  });

  it("writes the run folder, the index, and compares with the newest sibling", () => {
    const root = tmp();
    const input = join(tmp(), "a.pdf");
    writeFileSync(input, "pdf");
    const key = { id: "A" } as never;
    const first = writeRunArtifact({
      root,
      summary: summary([result("A", 0.2)], "2026-10-26T10:00:00.000Z", "old1234"),
      inputs: [{ id: "A", path: input, key }],
      publishInputs: false,
    });
    expect(existsSync(join(first, "cases", "A", "original.pdf"))).toBe(false);
    expect(existsSync(join(first, "cases", "A", "answer-key.json"))).toBe(true);

    const second = writeRunArtifact({
      root,
      summary: summary([result("A", 0.7)]),
      inputs: [{ id: "A", path: input, key }],
      publishInputs: true,
    });
    expect(existsSync(join(second, "cases", "A", "original.pdf"))).toBe(true);
    expect(readFileSync(join(second, "report.md"), "utf8")).toContain("+50 pts");
    const index = readFileSync(join(root, "INDEX.md"), "utf8");
    expect(index.match(/\| `/g)).toHaveLength(2);
  });
});
