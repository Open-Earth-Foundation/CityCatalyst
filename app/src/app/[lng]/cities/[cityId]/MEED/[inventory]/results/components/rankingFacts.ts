/**
 * Numbers the results screen quotes about the ranking itself.
 *
 * Everything here is read out of the prioritization result — never recomputed
 * from local wizard state — so the census line and the context cards always
 * describe the ranking the user is actually looking at. Anything the response
 * does not carry comes back as `null` and the caller drops that clause rather
 * than showing a plausible-looking zero.
 */
import type {
  MeedPrioritizeCityResult,
  MeedRankedActionResult,
} from "@/util/types/meed";

function asCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  return null;
}

/**
 * How many candidate actions the **legal filter** removed before scoring.
 *
 * The authoritative source is `metadata.counts.discarded_legal`. The loose key
 * probing below is kept only for rankings stored before that field existed; it
 * is deliberately last, because those older spellings were never produced by
 * the service and one of them (`excluded_count`) used to be filled with
 * "catalog size minus top-N", which is not an exclusion count at all.
 */
export function excludedActionCount(
  ranking: MeedPrioritizeCityResult | null,
): number | null {
  const metadata = ranking?.metadata;
  if (!metadata) return null;

  const discardedLegal = asCount(metadata.counts?.discarded_legal);
  if (discardedLegal !== null) return discardedLegal;

  for (const key of [
    "excluded_action_ids",
    "excludedActionIds",
    "excluded_actions",
    "legal_excluded_count",
  ]) {
    const count = asCount(metadata[key]);
    if (count !== null) return count;
  }
  return null;
}

/**
 * The pillar weights this ranking was actually scored with.
 *
 * Read from the response rather than from the user's stored slider values on
 * purpose: the results drawer prints the arithmetic (`impact × w + …  = final
 * score`) next to `final_score` itself, so the weights have to be the ones the
 * backend used. Taking them from local preferences would make the printed sum
 * stop matching as soon as a slider moved without regenerating. "Your inputs
 * have changed since this ranking" is a separate signal, and `isStale` owns it.
 *
 * Normalised by their own sum so a percent-scale payload (55/22/23) renders as
 * `× 0.55` rather than `× 55.00`.
 */
export function readRankingWeights(
  ranking: MeedPrioritizeCityResult | null,
  fallback: MeedScoreWeights,
): MeedScoreWeights {
  const w = ranking?.metadata?.weights;
  if (!w) return fallback;
  const { impact, alignment, feasibility } = w;
  const values = [impact, alignment, feasibility];
  if (
    !values.every((v) => typeof v === "number" && Number.isFinite(v) && v > 0)
  )
    return fallback;
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return fallback;
  return {
    impact: impact / total,
    alignment: alignment / total,
    feasibility: feasibility / total,
  };
}

export interface MeedScoreWeights {
  impact: number;
  alignment: number;
  feasibility: number;
}

/** What each pillar actually adds to the final score: score × weight. */
export interface MeedScoreContributions {
  impact: number;
  alignment: number;
  feasibility: number;
  /** Sum of the three, for display; `final_score` stays the source of truth. */
  total: number;
}

export function scoreContributions(
  action: Pick<
    MeedRankedActionResult,
    "impact_score" | "alignment_score" | "feasibility_score"
  >,
  weights: MeedScoreWeights,
): MeedScoreContributions {
  const impact = action.impact_score * weights.impact;
  const alignment = action.alignment_score * weights.alignment;
  const feasibility = action.feasibility_score * weights.feasibility;
  return {
    impact,
    alignment,
    feasibility,
    total: impact + alignment + feasibility,
  };
}

/** The legal screening funnel: how many were assessed, passed, and ranked. */
export interface MeedLegalFunnel {
  assessed: number;
  passed: number;
  ranked: number;
}

/**
 * Assessed comes from the response when it says so, otherwise from the catalog
 * size the caller knows. Passed is `valid_actions`, or assessed minus the legal
 * discards when only those are reported. Null when there is no ranking or the
 * response carries neither count — better than a confident wrong funnel.
 */
export function legalFunnel(
  ranking: MeedPrioritizeCityResult | null,
  catalogSize: number,
): MeedLegalFunnel | null {
  if (!ranking) return null;
  const counts = ranking.metadata?.counts;
  const ranked = ranking.ranked_actions?.length ?? 0;
  const assessed = asCount(counts?.total_actions) ?? catalogSize;
  if (!assessed) return null;
  const valid = asCount(counts?.valid_actions);
  const discarded = asCount(counts?.discarded_legal);
  const passed =
    valid ??
    (discarded !== null ? Math.max(assessed - discarded, ranked) : null);
  if (passed === null) return null;
  return { assessed, passed, ranked };
}

export interface MeedPolicyBacking {
  /** Alignment score above 0.75. */
  strong: number;
  /** Alignment score from 0.50 up to 0.75. */
  moderate: number;
  /** Mean alignment score across every ranked action, 0..1. */
  average: number | null;
}

export function policyBacking(
  ranked: MeedRankedActionResult[],
): MeedPolicyBacking {
  if (ranked.length === 0) {
    return { strong: 0, moderate: 0, average: null };
  }
  let strong = 0;
  let moderate = 0;
  let total = 0;
  for (const action of ranked) {
    const score = action.alignment_score;
    total += score;
    if (score >= 0.75) strong += 1;
    else if (score >= 0.5) moderate += 1;
  }
  return { strong, moderate, average: total / ranked.length };
}
