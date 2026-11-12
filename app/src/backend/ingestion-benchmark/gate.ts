/**
 * Regression gate of the PDF extraction benchmark: compares each case of a run
 * with its per-case baseline (spec 6.3).
 *
 * Verdicts, most severe first:
 * - error: an attempt failed (any failure mode other than `scored`) where the
 *   baseline had no such failure;
 * - regression: the case passed before and fails now; its recall dropped more
 *   than 5 points and below the worst baseline attempt (attempts of one case
 *   vary more than 5 points, so a fixed drop alone flags noise); no attempt
 *   passes where the baseline had one; every attempt's total is further off
 *   than the worst baseline attempt; or at least 2 more attempts are 10x off
 *   than in the baseline;
 * - over budget: the case cost more than 3 times its forecast;
 * - incomplete: an interrupted run did not finish every attempt of the case, so
 *   it is not compared for regressions or budget;
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

export type Verdict =
  "ok" | "regression" | "error" | "over budget" | "incomplete";

export const RECALL_DROP = 0.05;
/** Extra 10x attempts, over the baseline's, that make a regression. */
export const TEN_X_MARGIN = 2;
export const BUDGET_FACTOR = 3;

export type CaseGate = {
  id: string;
  verdict: Verdict;
  reasons: string[];
  costUsd: number | null;
  forecastUsd: number | null;
  lines: [string, string, string][];
  /** The baseline verdict compared against (rescored when needed), or null. */
  baseline?: CaseVerdict | null;
};

const SEVERITY: Verdict[] = [
  "error",
  "regression",
  "over budget",
  "incomplete",
  "ok",
];

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
  expectedAttempts?: number,
): CaseGate {
  const base = comparison.baseline;
  let hits: { verdict: Verdict; text: string }[] = [];

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
      current.recallFailedAsZero !== null
    ) {
      // Without per-attempt recall (older entries), the floor is the baseline mean.
      const floor = base.attemptRecalls?.length
        ? Math.min(...base.attemptRecalls)
        : base.recallFailedAsZero;
      if (
        current.recallFailedAsZero < base.recallFailedAsZero - RECALL_DROP &&
        current.recallFailedAsZero < floor
      ) {
        hits.push({
          verdict: "regression",
          text: `recall ${pct(current.recallFailedAsZero)} vs ${pct(base.recallFailedAsZero)} in the baseline (worst baseline attempt ${pct(floor)})`,
        });
      }
    }
    if (base.attemptsPassed > 0 && current.attemptsPassed === 0) {
      hits.push({
        verdict: "regression",
        text: `no attempt passes; ${base.attemptsPassed} did in the baseline`,
      });
    }
    // Total error, for every case and the only quality signal on total-only
    // ones: flagged when even the best attempt is worse than the worst baseline
    // attempt, so ordinary variation between attempts does not count.
    const worst = (factors: (number | null)[]) =>
      Math.max(...factors.map((f) => f ?? Infinity));
    const best = (factors: (number | null)[]) =>
      Math.min(...factors.map((f) => f ?? Infinity));
    if (
      base.attemptTotalFactors?.length &&
      current.attemptTotalFactors?.length &&
      best(current.attemptTotalFactors) > worst(base.attemptTotalFactors)
    ) {
      hits.push({
        verdict: "regression",
        text: `every total is further off than the worst baseline attempt (best now ${best(current.attemptTotalFactors).toFixed(2)}x vs ${worst(base.attemptTotalFactors).toFixed(2)}x)`,
      });
    }
    if (current.tenXAttempts >= base.tenXAttempts + TEN_X_MARGIN) {
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

  if (expectedAttempts !== undefined && current.attempts < expectedAttempts) {
    // Fewer attempts cannot pass the all-attempts rule; that is not a regression.
    hits = hits.filter((hit) => hit.verdict === "error");
    hits.push({
      verdict: "incomplete",
      text: `${current.attempts} of ${expectedAttempts} attempts finished`,
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
    baseline: base,
  };
}

/** 1 when any case regressed or errored; over budget alone does not fail the run. */
export function exitCode(gates: CaseGate[]): 0 | 1 {
  return gates.some((g) => g.verdict === "regression" || g.verdict === "error")
    ? 1
    : 0;
}
