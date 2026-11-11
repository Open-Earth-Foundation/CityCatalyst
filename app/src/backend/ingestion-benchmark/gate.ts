/**
 * Regression gate of the PDF extraction benchmark: compares each case of a run
 * with its per-case baseline (spec 6.3).
 *
 * Verdicts, most severe first:
 * - error: an attempt failed (any failure mode other than `scored`) where the
 *   baseline had no such failure;
 * - regression: the case passed before and fails now, headline recall dropped
 *   more than 5 points, or more attempts are 10x off than in the baseline;
 * - over budget: the case cost more than 3 times its forecast;
 * - ok.
 */
import type { Comparison } from "@/backend/ingestion-benchmark/baseline";
import type { CaseVerdict } from "@/backend/ingestion-benchmark/metrics";
import {
  caseUsage,
  costUsd,
  type CaseResult,
  type FailureMode,
  type Prices,
} from "@/backend/ingestion-benchmark/report";

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

/**
 * Cost of `attempts` attempts of the case at `prices`, from the Before usage.
 * Its LLM tokens and its OCR pages are both summed over its attempts (each
 * attempt is a new upload), so both scale with the attempt count, the same way
 * the current case cost is summed.
 */
export function forecastUsd(
  before: CaseResult,
  prices: Prices | undefined,
  attempts: number,
): number | null {
  if (before.runs.length === 0) return null;
  const scale = attempts / before.runs.length;
  const usage = caseUsage(before);
  return costUsd(
    {
      ...usage,
      promptTokens: usage.promptTokens * scale,
      completionTokens: usage.completionTokens * scale,
      ocrPages: usage.ocrPages * scale,
    },
    prices,
  );
}

const nonScored = (verdict: CaseVerdict): number =>
  (Object.entries(verdict.failureModes) as [FailureMode, number][])
    .filter(([mode]) => mode !== "scored")
    .reduce((sum, [, count]) => sum + count, 0);

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

export function gateAgainstBaseline(
  current: CaseVerdict,
  comparison: Comparison,
  forecast: number | null,
): CaseGate {
  const base = comparison.baseline;
  const hits: { verdict: Verdict; text: string }[] = [];

  if (nonScored(current) > 0 && (base === null || nonScored(base) === 0)) {
    hits.push({
      verdict: "error",
      text: `${nonScored(current)} attempt(s) failed${base ? " where the baseline had none" : ""}`,
    });
  }
  if (base) {
    if (base.casePasses && !current.casePasses) {
      hits.push({
        verdict: "regression",
        text: "case passed in the baseline and fails now",
      });
    }
    if (
      base.recallFailedAsZero !== null &&
      current.recallFailedAsZero !== null &&
      current.recallFailedAsZero < base.recallFailedAsZero - RECALL_DROP
    ) {
      hits.push({
        verdict: "regression",
        text: `recall ${pct(current.recallFailedAsZero)} vs ${pct(base.recallFailedAsZero)} in the baseline`,
      });
    }
    if (current.tenXAttempts > base.tenXAttempts) {
      hits.push({
        verdict: "regression",
        text: `${current.tenXAttempts} attempt(s) 10x off vs ${base.tenXAttempts} in the baseline`,
      });
    }
  }
  if (
    current.costUsd !== null &&
    forecast !== null &&
    current.costUsd > BUDGET_FACTOR * forecast
  ) {
    hits.push({
      verdict: "over budget",
      text: `cost $${current.costUsd.toFixed(3)} is over ${BUDGET_FACTOR}x the forecast $${forecast.toFixed(3)}`,
    });
  }

  const verdict =
    SEVERITY.find((level) => hits.some((hit) => hit.verdict === level)) ?? "ok";
  const reasons = hits.map((hit) => `${hit.verdict}: ${hit.text}`);
  if (comparison.status !== "compared") {
    reasons.push(comparison.reason ?? comparison.status);
  }
  return {
    id: current.id,
    verdict,
    reasons,
    costUsd: current.costUsd,
    forecastUsd: forecast,
    lines: [],
  };
}

/** 1 when any case regressed or errored; over budget alone does not fail the run. */
export function exitCode(gates: CaseGate[]): 0 | 1 {
  return gates.some((g) => g.verdict === "regression" || g.verdict === "error")
    ? 1
    : 0;
}
