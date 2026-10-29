/**
 * Gate for incremental model runs: compares each case of a fresh run with the
 * same case in a "Before" run, adds the spend so far, and gives a verdict per
 * case, so a candidate model is stopped on the first problem instead of after a
 * full battery.
 *
 * Verdicts, most severe first:
 * - error: a run failed, a page failed, or a call stopped at the token limit;
 * - regression: recall dropped more than 5 points, or the total left the
 *   tolerance it met before;
 * - over budget: the case cost more than 3 times its forecast (Before tokens at
 *   the candidate's prices);
 * - ok.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  caseMetrics,
  caseUsage,
  costUsd,
  totalUsage,
  type CaseResult,
  type Prices,
  type RunSummary,
} from "./report";

export type Verdict = "ok" | "regression" | "error" | "over budget";

export const RECALL_DROP = 0.05;
export const BUDGET_FACTOR = 3;

export type CaseGate = {
  id: string;
  verdict: Verdict;
  reasons: string[];
  costUsd: number | null;
  forecastUsd: number | null;
  lines: [string, string, string][];
};

const SEVERITY: Verdict[] = ["error", "regression", "over budget", "ok"];

/** Cost of one run of the case at `prices`, from the Before tokens (mean per run) plus OCR. */
export function forecastUsd(before: CaseResult, prices: Prices): number | null {
  const usage = caseUsage(before);
  const runs = before.runs.length || 1;
  return costUsd(
    {
      ...usage,
      promptTokens: usage.promptTokens / runs,
      completionTokens: usage.completionTokens / runs,
    },
    prices,
  );
}

const pct = (ratio: number | null) =>
  ratio === null ? "n/a" : `${Math.round(ratio * 100)}%`;
const signed = (value: number | null) =>
  value === null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
const money = (value: number | null) =>
  value === null ? "n/a" : `$${value.toFixed(3)}`;
const k = (value: number | undefined) =>
  value === undefined ? "n/a" : `${(value / 1000).toFixed(1)}k`;

function recallRange(result: CaseResult): string {
  const values = result.runs
    .map((entry) => entry.score?.rowRecall)
    .filter((value): value is number => typeof value === "number");
  if (values.length < 2) return "";
  return ` (${pct(Math.min(...values))}–${pct(Math.max(...values))})`;
}

function tolerance(flag: boolean | null) {
  return flag === null ? "" : flag ? " in" : " out";
}

export function gateCase(
  after: CaseResult,
  before: CaseResult | undefined,
  prices: Prices,
): CaseGate {
  const now = caseMetrics(after);
  const old = before ? caseMetrics(before) : null;
  const usage = caseUsage(after);
  const cost = costUsd(usage, prices);
  const forecast = before ? forecastUsd(before, prices) : null;
  const failedPages = after.runs.flatMap((entry) => entry.failedPages ?? []);
  const reasons: { verdict: Verdict; text: string }[] = [];

  for (const entry of after.runs) {
    if (!entry.ok) {
      reasons.push({
        verdict: "error",
        text: `run ${entry.run} failed: ${entry.message ?? "import not completed"}`,
      });
    }
  }
  if (failedPages.length) {
    reasons.push({
      verdict: "error",
      text: `failed pages ${failedPages.join(", ")}`,
    });
  }
  if (usage.lengthStops) {
    reasons.push({
      verdict: "error",
      text: `${usage.lengthStops} call(s) cut off at the token limit`,
    });
  }
  if (
    old?.rowRecall != null &&
    now.rowRecall != null &&
    now.rowRecall < old.rowRecall - RECALL_DROP
  ) {
    reasons.push({
      verdict: "regression",
      text: `recall ${pct(now.rowRecall)} vs ${pct(old.rowRecall)} before`,
    });
  }
  if (
    old?.totalWithinTolerance === true &&
    now.totalWithinTolerance === false
  ) {
    reasons.push({
      verdict: "regression",
      text: `total ${signed(now.totalDiffPct)} left the tolerance`,
    });
  }
  if (cost !== null && forecast !== null && cost > forecast * BUDGET_FACTOR) {
    reasons.push({
      verdict: "over budget",
      text: `cost ${money(cost)} is over ${BUDGET_FACTOR}x the forecast ${money(forecast)}`,
    });
  }
  const verdict =
    SEVERITY.find((level) => reasons.some((r) => r.verdict === level)) ?? "ok";

  const beforeUsage = before ? caseUsage(before) : null;
  const beforeRuns = before?.runs.length || 1;
  const perRun = (value: number | undefined) =>
    value === undefined ? undefined : value / beforeRuns;
  return {
    id: after.keyId ?? after.id,
    verdict,
    reasons: reasons.map((r) => `${r.verdict}: ${r.text}`),
    costUsd: cost,
    forecastUsd: forecast,
    lines: [
      ["Rows extracted", fmt(old?.extractedRows), fmt(now.extractedRows)],
      [
        "Row recall",
        `${pct(old?.rowRecall ?? null)}${before ? recallRange(before) : ""}`,
        pct(now.rowRecall),
      ],
      ["Row precision", pct(old?.rowPrecision ?? null), pct(now.rowPrecision)],
      [
        "Value accuracy",
        pct(old?.valueAccuracy ?? null),
        pct(now.valueAccuracy),
      ],
      [
        "Classification accuracy",
        pct(old?.classificationAccuracy ?? null),
        pct(now.classificationAccuracy),
      ],
      [
        "Notation keys",
        old ? `${old.notationRecovered}/${old.notationScored}` : "n/a",
        `${now.notationRecovered}/${now.notationScored}`,
      ],
      [
        "Total vs key",
        `${signed(old?.totalDiffPct ?? null)}${tolerance(old?.totalWithinTolerance ?? null)}`,
        `${signed(now.totalDiffPct)}${tolerance(now.totalWithinTolerance)}`,
      ],
      [
        "Failed pages",
        "n/a",
        failedPages.length ? failedPages.join(", ") : "0",
      ],
      ["Calls cut at limit", "n/a", String(usage.lengthStops ?? 0)],
      [
        "Time per run",
        old?.seconds == null ? "n/a" : `${Math.round(old.seconds)} s`,
        now.seconds == null ? "n/a" : `${Math.round(now.seconds)} s`,
      ],
      [
        "LLM calls per run",
        fmt(perRun(beforeUsage?.calls)),
        fmt(usage.calls / (after.runs.length || 1)),
      ],
      [
        "Tokens in / out per run",
        beforeUsage
          ? `${k(perRun(beforeUsage.promptTokens))} / ${k(perRun(beforeUsage.completionTokens))}`
          : "n/a",
        `${k(usage.promptTokens / (after.runs.length || 1))} / ${k(usage.completionTokens / (after.runs.length || 1))}`,
      ],
      ["Reasoning tokens", "n/a", k(usage.reasoningTokens)],
      ["Largest output of one call", "n/a", k(usage.maxCompletionTokens)],
      ["Cost (LLM + OCR)", `forecast ${money(forecast)}`, money(cost)],
    ],
  };
}

const fmt = (value: number | null | undefined) =>
  value === null || value === undefined ? "n/a" : String(Math.round(value));

/** Sum of the estimated cost of every run folder under `root`. */
export function spendUnder(root: string): number {
  if (!existsSync(root)) return 0;
  return readdirSync(root)
    .map((name) => join(root, name, "results.json"))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, "utf8")) as RunSummary)
    .reduce(
      (sum, summary) =>
        sum + (costUsd(totalUsage(summary.results), summary.prices) ?? 0),
      0,
    );
}

export function renderGate(args: {
  after: RunSummary;
  before: RunSummary;
  spentUsd: number;
  capUsd: number;
}): { text: string; gates: CaseGate[] } {
  const { after, before, spentUsd, capUsd } = args;
  const beforeById = new Map(before.results.map((r) => [r.id, r]));
  const gates = after.results.map((result) =>
    gateCase(result, beforeById.get(result.id), after.prices ?? {}),
  );
  const lines = [
    `# Gate: ${after.extractionModel ?? "default"}${after.reasoningEffort ? ` (effort ${after.reasoningEffort})` : ""} vs ${before.extractionModel ?? "default"}`,
    "",
    `- Run: ${after.measuredAt.slice(0, 16).replace("T", " ")} UTC, commit \`${after.commit}\`, ${after.runsPerFile} run(s) per case`,
    `- Before: \`${before.commit}\`, ${before.runsPerFile} runs per case (means; recall range in brackets)`,
    `- Spend so far: ${money(spentUsd)} of the $${capUsd} cap${spentUsd > capUsd ? " (OVER THE CAP)" : ""}`,
    "",
  ];
  for (const gate of gates) {
    lines.push(
      `## ${gate.id}: ${gate.verdict}`,
      "",
      ...(gate.reasons.length ? gate.reasons.map((r) => `- ${r}`) : []),
      ...(gate.reasons.length ? [""] : []),
      "| Measure | Before | After |",
      "| --- | --- | --- |",
      ...gate.lines.map(
        ([label, old, now]) => `| ${label} | ${old} | ${now} |`,
      ),
      "",
    );
  }
  return { text: lines.join("\n"), gates };
}
