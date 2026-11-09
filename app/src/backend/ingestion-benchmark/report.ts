/**
 * Turns the output of the PDF extraction benchmark into a folder the whole
 * team can read: a markdown report, the full results and, per attempt, the
 * values the import stored. Inputs, answer keys and OCR text are never copied.
 *
 * One folder per run, named `<UTC date>-<UTC time>-<short sha>`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseGate } from "@/backend/ingestion-benchmark/gate";
import type {
  BlockSummary,
  CaseVerdict,
} from "@/backend/ingestion-benchmark/metrics";
import type {
  FileScore,
  StoredValue,
} from "@/backend/ingestion-benchmark/score";

export type Tokens = {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  /** Part of completionTokens spent on hidden reasoning; absent in runs before CC-1191. */
  reasoningTokens?: number;
  /** Calls cut off at the token limit (finish_reason "length"). */
  lengthStops?: number;
  /** Largest completion of a single call. */
  maxCompletionTokens?: number;
};

/** Unit prices in USD. Any missing price makes the cost "n/a" instead of a guess. */
export type Prices = {
  llmInputPerMTok?: number;
  llmOutputPerMTok?: number;
  ocrPerPage?: number;
};

export type FailureMode =
  | "scored"
  | "ocr_error"
  | "extraction_error"
  | "truncated"
  | "zero_rows"
  | "approve_error"
  | "readback_error";

export type Block = "validated" | "held-out" | "dev";

export type StageMs = {
  ocr: number | null;
  extraction: number | null;
  import: number | null;
  total: number;
};

export type RunEntry = {
  run: number;
  failureMode: FailureMode;
  zeroRowsReason?: string;
  warnings: string[];
  stageMs: StageMs;
  ok: boolean;
  ms: number;
  message?: string;
  extractedRows?: number;
  stored?: StoredValue[];
  score?: FileScore | null;
  total?: number;
  /** LLM usage of this run (extraction). */
  usage?: Tokens;
  /** Pages whose extraction failed twice and were skipped. */
  failedPages?: number[];
};

export type CaseResult = {
  id: string;
  file: string;
  kind: string;
  targetYear: number;
  keyId: string | null;
  ocr: { ok?: boolean; code?: string | null } | null;
  productFlowFailsAtOcr: boolean;
  runs: RunEntry[];
  stableTotal: boolean;
  block: Block;
  /** Counts toward the headline recall; null when the key is not a value-row case. */
  eligible: boolean | null;
  /** Scored on the total only, not row by row. */
  totalOnly: boolean;
  /** OCR runs in every PDF run (each run is a new upload); pages are summed over the runs. */
  ocrUsage?: Tokens & { pages: number | null };
};

export type RunSummary = {
  measuredAt: string;
  commit: string;
  branch: string;
  llmModel?: string;
  extractionModel?: string;
  /** LLM_EXTRACTION_REASONING_EFFORT; null means the provider default. */
  reasoningEffort?: string | null;
  ocrModel?: string;
  prices?: Prices;
  runsPerFile: number;
  /** Cases kept out of rule writing; reported apart from the validated set. */
  heldOut?: string[];
  results: CaseResult[];
  selection: string[];
  /** Attempts other than 3 per case. */
  exploratory: boolean;
  interrupted: boolean;
  promptHash: string | null;
  inputRepresentation: string | null;
  testSetVersion: string;
  dirty: boolean;
  mlflowRunUrl: string | null;
  mlflowNote: string | null;
};

export type CaseMetrics = {
  ocrOk: boolean | null;
  ocrCode: string | null;
  extractedRows: number | null;
  rowRecall: number | null;
  rowPrecision: number | null;
  valueAccuracy: number | null;
  classificationAccuracy: number | null;
  notationRecovered: number;
  notationScored: number;
  totalDiffPct: number | null;
  totalWithinTolerance: boolean | null;
  stableTotal: boolean;
  seconds: number | null;
};

export type Aggregate = {
  cases: number;
  scored: number;
  ocrFailures: number;
  rowRecall: number | null;
  rowPrecision: number | null;
  valueAccuracy: number | null;
  classificationAccuracy: number | null;
};

const mean = (values: (number | null | undefined)[]): number | null => {
  const present = values.filter((v): v is number => typeof v === "number");
  return present.length
    ? present.reduce((sum, v) => sum + v, 0) / present.length
    : null;
};

function allWithinTolerance(
  scores: Array<{ totalWithinTolerance: boolean | null } | null>,
): boolean | null {
  const flags = scores
    .map((score) => score?.totalWithinTolerance)
    .filter((flag): flag is boolean => typeof flag === "boolean");
  return flags.length ? flags.every(Boolean) : null;
}

export function caseMetrics(result: CaseResult): CaseMetrics {
  const okRuns = result.runs.filter((entry) => entry.ok);
  const scores = okRuns.map((entry) => entry.score ?? null);
  const first = scores.find((score) => score) ?? null;
  return {
    ocrOk: result.ocr ? result.ocr.ok === true : null,
    ocrCode: result.ocr?.code ?? null,
    extractedRows: mean(okRuns.map((entry) => entry.extractedRows)),
    rowRecall: mean(scores.map((score) => score?.rowRecall)),
    rowPrecision: mean(scores.map((score) => score?.rowPrecision)),
    valueAccuracy: mean(scores.map((score) => score?.valueAccuracy)),
    classificationAccuracy: mean(
      scores.map((score) => score?.classificationAccuracy),
    ),
    notationRecovered: first?.notationRecovered ?? 0,
    notationScored: first?.notationScored ?? 0,
    totalDiffPct: mean(scores.map((score) => score?.totalDiffPct)),
    totalWithinTolerance: allWithinTolerance(scores),
    stableTotal: result.stableTotal,
    seconds: mean(result.runs.map((entry) => entry.ms / 1000)),
  };
}

export function aggregate(results: CaseResult[]): Aggregate {
  const metrics = results.map(caseMetrics);
  return {
    cases: results.length,
    scored: metrics.filter((m) => m.rowRecall !== null).length,
    ocrFailures: results.filter((result) => result.productFlowFailsAtOcr)
      .length,
    rowRecall: mean(metrics.map((m) => m.rowRecall)),
    rowPrecision: mean(metrics.map((m) => m.rowPrecision)),
    valueAccuracy: mean(metrics.map((m) => m.valueAccuracy)),
    classificationAccuracy: mean(metrics.map((m) => m.classificationAccuracy)),
  };
}

export type GroupSummary = Aggregate & {
  /** Means over row-scored cases, counting a failed run (no rows) as 0. */
  rowRecallWithFailed: number | null;
  valueAccuracyWithFailed: number | null;
  /** Cases with an expected total. */
  totalCases: number;
  /** Cases whose total is within tolerance in every run. */
  totalCasesWithin: number;
  totalRuns: number;
  totalRunsWithin: number;
};

export function groupSummary(results: CaseResult[]): GroupSummary {
  const scoredRuns = (result: CaseResult) =>
    result.runs.flatMap((entry) => (entry.score ? [entry.score] : []));
  const withFailed = (pick: (score: FileScore) => number | null) =>
    mean(
      results.map((result) =>
        mean(
          scoredRuns(result)
            .filter((score) => score.rowRecall !== null)
            .map((score) => pick(score) ?? 0),
        ),
      ),
    );
  const totals = results
    .map((result) =>
      scoredRuns(result).filter((score) => score.expectedTotal !== null),
    )
    .filter((scores) => scores.length > 0);
  return {
    ...aggregate(results),
    rowRecallWithFailed: withFailed((score) => score.rowRecall),
    valueAccuracyWithFailed: withFailed((score) => score.valueAccuracy),
    totalCases: totals.length,
    totalCasesWithin: totals.filter((scores) =>
      scores.every((score) => score.totalWithinTolerance),
    ).length,
    totalRuns: totals.flat().length,
    totalRunsWithin: totals.flat().filter((score) => score.totalWithinTolerance)
      .length,
  };
}

export const ZERO_TOKENS: Tokens = {
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  reasoningTokens: 0,
  lengthStops: 0,
  maxCompletionTokens: 0,
};

export const addTokens = (a: Tokens, b?: Tokens): Tokens => ({
  calls: a.calls + (b?.calls ?? 0),
  promptTokens: a.promptTokens + (b?.promptTokens ?? 0),
  completionTokens: a.completionTokens + (b?.completionTokens ?? 0),
  reasoningTokens: (a.reasoningTokens ?? 0) + (b?.reasoningTokens ?? 0),
  lengthStops: (a.lengthStops ?? 0) + (b?.lengthStops ?? 0),
  maxCompletionTokens: Math.max(
    a.maxCompletionTokens ?? 0,
    b?.maxCompletionTokens ?? 0,
  ),
});

export type CaseUsage = Tokens & { ocrPages: number; ocrPagesKnown: boolean };

/** Everything one case spent: OCR once plus every run's extraction. */
export function caseUsage(result: CaseResult): CaseUsage {
  const tokens = result.runs.reduce(
    (sum, run) => addTokens(sum, run.usage),
    addTokens(ZERO_TOKENS, result.ocrUsage),
  );
  return {
    ...tokens,
    ocrPages: result.ocrUsage?.pages ?? 0,
    ocrPagesKnown: result.ocrUsage?.pages != null,
  };
}

export function totalUsage(results: CaseResult[]): CaseUsage {
  return results.map(caseUsage).reduce(
    (sum, usage) => ({
      ...addTokens(sum, usage),
      ocrPages: sum.ocrPages + usage.ocrPages,
      ocrPagesKnown: sum.ocrPagesKnown && usage.ocrPagesKnown,
    }),
    { ...ZERO_TOKENS, ocrPages: 0, ocrPagesKnown: true },
  );
}

/** USD, or null when a price needed for the usage is missing. */
export function costUsd(usage: CaseUsage, prices?: Prices): number | null {
  const { llmInputPerMTok, llmOutputPerMTok, ocrPerPage } = prices ?? {};
  if (
    llmInputPerMTok === undefined ||
    llmOutputPerMTok === undefined ||
    ocrPerPage === undefined
  ) {
    return null;
  }
  return (
    (usage.promptTokens / 1e6) * llmInputPerMTok +
    (usage.completionTokens / 1e6) * llmOutputPerMTok +
    usage.ocrPages * ocrPerPage
  );
}

const money = (value: number | null) =>
  value === null ? "n/a" : `$${value.toFixed(value < 1 ? 3 : 2)}`;

const tokensText = (usage: CaseUsage) =>
  `${(usage.promptTokens / 1000).toFixed(0)}k / ${(usage.completionTokens / 1000).toFixed(0)}k`;

const pct = (ratio: number | null) =>
  ratio === null ? "n/a" : `${Math.round(ratio * 100)}%`;

const cell = (text: string) => text.replace(/\|/g, "\\|");

/** Tolerance rule of the first scored attempt, or "n/a" when no attempt was scored. */
function toleranceSourceOf(result: CaseResult): string {
  return (
    result.runs.find((run) => run.failureMode === "scored" && run.score)?.score
      ?.toleranceSource ?? "n/a"
  );
}

/** Seconds spent in each stage, summed over the attempts. */
function stageSeconds(result: CaseResult): string {
  const sum = (pick: (stage: StageMs) => number | null) => {
    const values = result.runs
      .map((run) => pick(run.stageMs))
      .filter((v): v is number => v !== null);
    return values.length
      ? `${Math.round(values.reduce((a, b) => a + b, 0) / 1000)} s`
      : "n/a";
  };
  return `ocr ${sum((s) => s.ocr)}, extraction ${sum((s) => s.extraction)}, import ${sum((s) => s.import)}`;
}

function failureModesText(verdict: CaseVerdict | undefined): string {
  if (!verdict) return "n/a";
  const parts = Object.entries(verdict.failureModes)
    .filter(([mode, count]) => mode !== "scored" && count > 0)
    .map(([mode, count]) => `${mode} ${count}`);
  return parts.length ? parts.join(", ") : "none";
}

export function renderReport(
  summary: RunSummary,
  verdicts: CaseVerdict[],
  blocks: BlockSummary[],
  gates: CaseGate[],
): string {
  const verdictById = new Map(verdicts.map((v) => [v.id, v]));
  const gateById = new Map(gates.map((g) => [g.id, g]));
  const usage = totalUsage(summary.results);
  const cost = costUsd(usage, summary.prices);
  const title = `# PDF benchmark run ${summary.measuredAt.slice(0, 16).replace("T", " ")} UTC${summary.interrupted ? " - INTERRUPTED" : ""}${summary.exploratory ? " (exploratory)" : ""}`;
  const lines: string[] = [
    title,
    "",
    `- Commit: \`${summary.commit}\` on \`${summary.branch}\`${summary.dirty ? " (dirty working tree)" : ""}`,
    `- Extraction model: ${summary.extractionModel ?? summary.llmModel ?? "default"}; reasoning effort: ${summary.reasoningEffort ?? "provider default"}; OCR model: ${summary.ocrModel ?? "default"}`,
    `- Prompt hash: ${summary.promptHash ?? "n/a"}`,
    `- Input representation: ${summary.inputRepresentation ?? "n/a"}`,
    `- Test-set version: ${summary.testSetVersion}`,
    `- Attempts per case: ${summary.runsPerFile}`,
    `- Selection: ${summary.selection.length ? summary.selection.join(", ") : "none"}`,
    `- MLflow: ${summary.mlflowRunUrl ?? summary.mlflowNote ?? "not logged"}`,
    "",
  ];
  if (summary.interrupted) {
    lines.push(
      "**INTERRUPTED**: the run stopped before every case finished; numbers cover the finished cases only.",
      "",
    );
  }

  for (const block of blocks) {
    lines.push(
      `## Block: ${block.block}`,
      "",
      `- ${block.casesInRun} of ${block.casesInManifest} cases in this run`,
      `- Headline recall (failed attempts count as 0): ${pct(block.headlineRecall)}; cases with totals within tolerance: ${block.casesTotalWithinTolerance}`,
      `- Recall over scored attempts only: ${pct(block.recallScoredOnly)}`,
      `- Attempts passing: ${pct(block.attemptPassShare)}`,
      `- Attempts 10x or more off the expected total: ${block.tenXAttempts}`,
      `- Wrong totals that carried a warning: ${pct(block.warningShare)}`,
      "",
    );
  }

  const tenX = verdicts.reduce((sum, v) => sum + v.tenXAttempts, 0);
  const warnings = summary.results.flatMap((result) =>
    [...new Set(result.runs.flatMap((run) => run.warnings))].map((text) => ({
      id: result.id,
      text,
    })),
  );
  lines.push(
    "## Guardrails",
    "",
    `- 10x guardrail: ${tenX} attempt${tenX === 1 ? "" : "s"} with a stored total 10x or more off the expected total`,
    warnings.length
      ? `- Warnings:\n${warnings.map((w) => `  - ${w.id}: ${cell(w.text)}`).join("\n")}`
      : "- Warnings: none",
    "",
    "## Regressions against the baseline",
    "",
  );
  if (gates.length === 0) {
    lines.push("No baseline comparison in this run.", "");
  } else {
    lines.push("| Case | Verdict | Reasons |", "| --- | --- | --- |");
    for (const gate of gates) {
      lines.push(
        `| ${cell(gate.id)} | ${gate.verdict} | ${cell(gate.reasons.join("; ") || "-")} |`,
      );
    }
    lines.push("");
  }

  const modeTotals = new Map<string, number>();
  for (const verdict of verdicts) {
    for (const [mode, count] of Object.entries(verdict.failureModes)) {
      if (mode !== "scored" && count > 0) {
        modeTotals.set(mode, (modeTotals.get(mode) ?? 0) + count);
      }
    }
  }
  lines.push(
    "## Failure modes",
    "",
    modeTotals.size
      ? [...modeTotals].map(([mode, count]) => `- ${mode}: ${count}`).join("\n")
      : "No failed attempts.",
    "",
    "## Per case",
    "",
    "Recall counts failed attempts as 0. Runtime is summed over the attempts.",
    "",
    "| Case | Block | Verdict | Attempts passed | Recall | Total within tolerance | 10x | Failure modes | Cost | Tokens in / out | Runtime by stage | Tolerance source |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const result of summary.results) {
    const v = verdictById.get(result.id);
    const within =
      v?.totalWithinToleranceAll == null
        ? "n/a"
        : v.totalWithinToleranceAll
          ? "yes"
          : "no";
    lines.push(
      `| ${cell(result.id)} | ${result.block} | ${gateById.get(result.id)?.verdict ?? "n/a"} | ${v ? `${v.attemptsPassed}/${v.attempts}` : "n/a"} | ${pct(v?.recallFailedAsZero ?? null)} | ${within} | ${v?.tenXAttempts ?? "n/a"} | ${failureModesText(v)} | ${money(v?.costUsd ?? null)} | ${tokensText(caseUsage(result))} | ${stageSeconds(result)} | ${toleranceSourceOf(result)} |`,
    );
  }

  const legacy = summary.results
    .filter((result) => toleranceSourceOf(result) === "legacy")
    .map((result) => result.id);
  const unknownTables = summary.results
    .filter((result) => result.eligible === null)
    .map((result) => result.id);
  lines.push(
    "",
    `Estimated cost of this run: ${money(cost)}`,
    "",
    "## Notes",
    "",
    "- C-028 and C-031 are not fully held out.",
    `- Cases using the legacy tolerance: ${legacy.length ? legacy.join(", ") : "none"}`,
    `- Cases where \`textTables\` is unknown: ${unknownTables.length ? unknownTables.join(", ") : "none"}`,
    "",
  );
  return lines.join("\n");
}

export function renderIndexLine(
  summary: RunSummary,
  blocks: BlockSummary[],
  folder: string,
): string {
  const recall = (block: Block) =>
    pct(blocks.find((b) => b.block === block)?.headlineRecall ?? null);
  const flags = `${summary.exploratory ? " (exploratory)" : ""}${summary.interrupted ? " (INTERRUPTED)" : ""}`;
  const cost = costUsd(totalUsage(summary.results), summary.prices);
  return `| ${summary.measuredAt.slice(0, 16).replace("T", " ")}${flags} | \`${summary.commit}\` | ${summary.results.length} | ${recall("validated")} | ${recall("held-out")} | ${money(cost)} | [${folder}](./${folder}/report.md) |`;
}

export const INDEX_HEADER = [
  "# PDF benchmark runs",
  "",
  "One line per benchmark run, oldest first. Open the report for per-case numbers and regressions.",
  "",
  "| Run (UTC) | Commit | Cases | Validated recall | Held-out recall | Est. cost | Report |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  "",
].join("\n");

export function gitInfo(): { commit: string; branch: string } {
  const git = (...args: string[]) => {
    try {
      return execFileSync("git", args, { encoding: "utf8" }).trim();
    } catch {
      return "unknown";
    }
  };
  return {
    commit: git("rev-parse", "--short", "HEAD"),
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
  };
}

export function runFolderName(measuredAt: string, commit: string): string {
  const stamp = measuredAt.slice(0, 16).replace("T", "-").replace(":", "");
  return `${stamp}-${commit}`;
}

/**
 * Writes the run folder under `outRoot` and returns its path. Holds the report,
 * the full results (including the stored values a later baseline rescore
 * needs) and each attempt's extracted values. Never copies inputs, answer keys
 * or OCR text.
 */
export function writeRunArtifact(args: {
  outRoot: string;
  summary: RunSummary;
  verdicts: CaseVerdict[];
  blocks: BlockSummary[];
  gates: CaseGate[];
}): string {
  const { outRoot, summary, verdicts, blocks, gates } = args;
  const dir = join(outRoot, runFolderName(summary.measuredAt, summary.commit));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "results.json"),
    JSON.stringify({ ...summary, verdicts, blocks, gates }, null, 2),
  );
  writeFileSync(
    join(dir, "report.md"),
    renderReport(summary, verdicts, blocks, gates),
  );
  for (const result of summary.results) {
    for (const run of result.runs) {
      const attemptDir = join(dir, "cases", result.id, `attempt-${run.run}`);
      mkdirSync(attemptDir, { recursive: true });
      writeFileSync(
        join(attemptDir, "extracted-values.json"),
        JSON.stringify(run.stored ?? [], null, 2),
      );
    }
  }
  return dir;
}
