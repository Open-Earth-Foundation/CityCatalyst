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
 * How many candidate actions the legal filter removed before scoring.
 * Tolerates the snake_case and camelCase spellings the prioritizer has used
 * for this metadata field.
 */
export function excludedActionCount(
  ranking: MeedPrioritizeCityResult | null,
): number | null {
  const metadata = ranking?.metadata;
  if (!metadata) return null;
  for (const key of [
    "excluded_action_ids",
    "excludedActionIds",
    "excluded_actions",
    "excluded_count",
    "excludedCount",
    "legal_excluded_count",
  ]) {
    const count = asCount(metadata[key]);
    if (count !== null) return count;
  }
  return null;
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
