/**
 * Adapts the CityCatalyst ranking route's response into our internal result
 * shape.
 *
 * Two mismatches are handled here and nowhere else:
 *
 * 1. **Casing.** The route's model is camelCase (`actionId`, `finalScore`),
 *    which is correct for CityCatalyst. Our internal types are the
 *    prioritizer's snake_case, and every screen already reads them. Adapting at
 *    this boundary keeps that one translation in one file instead of touching
 *    every consumer. Note that `evidenceSummary`'s *contents* are already
 *    snake_case on the wire, so that block passes through untouched.
 *
 * 2. **Ordering.** `getRanking` uses `findAll` with no `order` clause, so rows
 *    arrive in whatever order Postgres returns them, and the results screen
 *    takes the first three as top picks. Sorting by `rank` here is cheap
 *    insurance that does not depend on the backend adding an ORDER BY.
 *
 * The response describes one inventory, not one city, so it carries no
 * `locode`; callers that have one pass it in.
 */
import type {
  MeedHardFilterEvidence,
  MeedPrioritizationWeights,
  MeedPrioritizeCityResult,
  MeedRankedActionResult,
  MeedRankRouteRankedAction,
  MeedRankRouteRemovedAction,
  MeedRankRouteResponse,
  MeedRemovedActionLegalEvidence,
  MeedRemovedActionSummary,
} from "@/util/types/meed";

const LEGAL_HARD_FILTER = "legal_hard_filter";
const USER_EXCLUSION = "user_exclusion";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Unwrap the `{ data: … }` envelope; a bare payload is accepted too. */
function unwrap(payload: unknown): MeedRankRouteResponse {
  const root = asRecord(payload);
  if (!root) return {};
  const inner = asRecord(root.data) ?? root;
  return inner as MeedRankRouteResponse;
}

function toRankedAction(
  raw: MeedRankRouteRankedAction,
): MeedRankedActionResult {
  return {
    action_id: raw.actionId as string,
    rank: num(raw.rank),
    final_score: num(raw.finalScore),
    impact_score: num(raw.impactScore),
    alignment_score: num(raw.alignmentScore),
    feasibility_score: num(raw.feasibilityScore),
    // Already snake_case inside — the screens read it as-is.
    evidence_summary: raw.evidenceSummary ?? {},
    ...(raw.explanations ? { explanations: raw.explanations } : {}),
  };
}

/**
 * Legal evidence for a removed action.
 *
 * Now close to a pass-through: the route carries `{ en, es }` maps and we keep
 * them as maps, so the language choice happens at the point of display via
 * `resolveLocalizedText`. This previously split each map into `_en`/`_es`
 * fields, which meant a third language would have required changing the type,
 * this function and every consumer.
 */
function toLegalEvidence(
  raw: MeedRankRouteRemovedAction,
): MeedRemovedActionLegalEvidence | null {
  const references = asArray(raw.legalReferences).filter(
    (r): r is string => typeof r === "string",
  );

  const evidence: MeedRemovedActionLegalEvidence = {
    verdictCategory: str(raw.verdictCategory),
    ownershipCategory: str(raw.ownershipCategory),
    ownershipDescription: raw.ownershipDescription ?? null,
    restrictionsCategory: str(raw.restrictionsCategory),
    restrictionsDescription: raw.restrictionsDescription ?? null,
    legalJustification: raw.legalJustification ?? null,
    legalReferences: references,
  };

  const carriesSomething =
    references.length > 0 ||
    Object.entries(evidence).some(
      ([key, value]) => key !== "legalReferences" && value != null,
    );
  return carriesSomething ? evidence : null;
}

function toRemovedAction(
  raw: MeedRankRouteRemovedAction,
): MeedRemovedActionSummary {
  const legal = toLegalEvidence(raw);
  return {
    action_id: raw.actionId as string,
    action_name: raw.actionName ?? (raw.actionId as string),
    removal_reason: str(raw.removalReason),
    removal_source: str(raw.removalSource) ?? "",
    ...(legal ? { legal } : {}),
  };
}

/**
 * Per-action legal evidence, keyed by action ID.
 *
 * The regulations screen reads *flagged* actions — kept in the ranking but with
 * no legal assessment behind them — from this map only, because a kept action
 * never appears in `removed_actions`. The route reports the same fact per
 * ranked action under `evidenceSummary.feasibility.legal`, so the map is
 * rebuilt from there rather than left empty.
 */
function toHardFilterEvidence(
  ranked: MeedRankRouteRankedAction[],
): Record<string, MeedHardFilterEvidence> {
  const map: Record<string, MeedHardFilterEvidence> = {};

  for (const action of ranked) {
    const actionId = str(action.actionId);
    if (!actionId) continue;
    const feasibility = asRecord(asRecord(action.evidenceSummary)?.feasibility);
    const legal = asRecord(feasibility?.legal);
    if (!legal) continue;

    const present =
      typeof legal.assessment_present === "boolean"
        ? legal.assessment_present
        : typeof legal.assessment_missing === "boolean"
          ? !legal.assessment_missing
          : null;
    if (present === null && legal.verdict_category == null) continue;

    map[actionId] = {
      legal_assessment_present: present,
      legal_verdict_category: str(legal.verdict_category),
      legal_assessment_summary: legal,
    };
  }
  return map;
}

/**
 * When the stored ranking was produced, from the row timestamps the route
 * carries. The rows are written in one transaction, so the latest of them is
 * the generation time; `null` when the payload carries no ranking at all.
 */
export function rankingGeneratedAt(payload: unknown): string | null {
  const { rankedActions } = unwrap(payload);
  let latest: string | null = null;
  for (const row of asArray(rankedActions)) {
    const record = asRecord(row);
    if (!record) continue;
    const stamp = str(record.lastUpdated) ?? str(record.created);
    if (stamp && (latest === null || stamp > latest)) latest = stamp;
  }
  return latest;
}

export interface MeedRankingAdapterOptions {
  /** The response is per-inventory and carries no locode of its own. */
  locode?: string;
}

export function toMeedPrioritizeCityResult(
  payload: unknown,
  options: MeedRankingAdapterOptions = {},
): MeedPrioritizeCityResult {
  const { rankedActions, removedActions } = unwrap(payload);

  const rawRanked = asArray(rankedActions)
    .map((row) => asRecord(row) as MeedRankRouteRankedAction | null)
    .filter(
      (row): row is MeedRankRouteRankedAction => !!row && !!str(row.actionId),
    )
    // Rows without a rank sort last rather than colliding at 0 and displacing
    // a genuine first place.
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

  const ranked = rawRanked.map(toRankedAction);

  const removed = asArray(removedActions)
    .map((row) => asRecord(row) as MeedRankRouteRemovedAction | null)
    .filter(
      (row): row is MeedRankRouteRemovedAction => !!row && !!str(row.actionId),
    )
    .map(toRemovedAction);

  const weights = rawRanked.find((a) => {
    const w = a.weights;
    return (
      w &&
      typeof w.impact === "number" &&
      typeof w.alignment === "number" &&
      typeof w.feasibility === "number"
    );
  })?.weights as MeedPrioritizationWeights | undefined;

  const hardFilterEvidence = toHardFilterEvidence(rawRanked);

  return {
    locode: options.locode ?? "",
    ranked_action_ids: ranked.map((a) => a.action_id),
    ranked_actions: ranked,
    removed_actions: removed,
    metadata: {
      // Only the counts the response actually supports. `total_actions` and
      // `valid_actions` are not derivable from a top-N response — leaving them
      // out lets the consumers' own fallbacks answer instead of publishing a
      // confident wrong number.
      counts: {
        ranked_actions: ranked.length,
        discarded_legal: removed.filter(
          (r) => r.removal_source === LEGAL_HARD_FILTER,
        ).length,
        discarded_excluded: removed.filter(
          (r) => r.removal_source === USER_EXCLUSION,
        ).length,
      },
      ...(weights ? { weights } : {}),
      ...(Object.keys(hardFilterEvidence).length > 0
        ? { hard_filter_evidence_by_action_id: hardFilterEvidence }
        : {}),
    },
  };
}
