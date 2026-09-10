import type {
  MeedPrioritizeCityResult,
  MeedRankedActionResult,
} from "@/util/types/meed";
import type { MeedActionIndex } from "./[inventory]/results/components/actionCatalog";

/**
 * Builds a stand-in ranking from the **live action catalog**, so the results
 * screens can be reviewed before the prioritization service exists.
 *
 * Every action id, name, sector, timeline and co-benefit in the output is real
 * — it comes from `/api/v1/action-pathways` via the module's own proxy. Only
 * the three pillar scores are synthetic, and they are derived deterministically
 * from the action id so the ordering is stable between runs rather than
 * reshuffling on every render.
 *
 * This is strictly a review aid. It is only ever called behind the
 * `MEED_MOCK_RANKING` feature flag, which is off by default, and the ranking it
 * produces is tagged `isMock` so the UI can say so out loud. Delete this file
 * when `POST /v1/prioritize` is wired up.
 */

/**
 * Small deterministic hash so a given action always scores the same.
 *
 * The final avalanche step matters. Action ids run in sequence (`icare_0006`,
 * `icare_0007`, …), and a plain `hash * 31 + char` rolling hash leaves
 * neighbouring ids one apart in the low bits — so `% 1000` produced adjacent
 * values that collapsed entirely once rounded to two decimals, and the top of
 * the ranking came out with every action scoring identically. Mixing the bits
 * before the modulo spreads them.
 */
function seededUnit(seed: string, salt: number): number {
  let h = salt >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  // murmur3 fmix32 avalanche
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  // 0.28 … 0.95, avoiding the extremes so the bars all read plausibly.
  return 0.28 + ((h % 1000) / 1000) * 0.67;
}

const WEIGHTS = { impact: 0.55, alignment: 0.22, feasibility: 0.23 };

export interface MeedMockOptions {
  locode: string;
  /** How many actions to rank. */
  topN?: number;
  /** Action ids the user confirmed for exclusion, honoured like the real run. */
  excludedActionIds?: string[];
}

export function buildMockRanking(
  index: MeedActionIndex,
  { locode, topN = 20, excludedActionIds = [] }: MeedMockOptions,
): MeedPrioritizeCityResult | null {
  const all = [...index.values()].filter((a) => a.actionId);
  if (all.length === 0) return null;

  // Honour the user's confirmed exclusions, so confirming them on pre-flight
  // visibly changes the result rather than doing nothing.
  const excluded = new Set(excludedActionIds);
  const afterExclusions = all.filter((a) => !excluded.has(a.actionId!));

  // A small deterministic slice stands in for the legal hard filter, so the
  // Regulations screen has something to render behind the flag. `seededUnit`
  // spans 0.28…0.95, so these thresholds pick out roughly 6% and 3% of the
  // catalog respectively.
  const blockedIds = new Set(
    afterExclusions
      .filter((a) => seededUnit(a.actionId!, 101) > 0.91)
      .map((a) => a.actionId!),
  );
  // A couple more are "kept but unassessed" — the flagged population.
  const flaggedIds = new Set(
    afterExclusions
      .filter(
        (a) =>
          !blockedIds.has(a.actionId!) && seededUnit(a.actionId!, 211) > 0.93,
      )
      .map((a) => a.actionId!),
  );

  const actions = afterExclusions.filter((a) => !blockedIds.has(a.actionId!));

  const scored = actions.map((action) => {
    const id = action.actionId!;
    const impact = seededUnit(id, 7);
    const alignment = seededUnit(id, 13);
    const feasibility = seededUnit(id, 29);
    const final =
      impact * WEIGHTS.impact +
      alignment * WEIGHTS.alignment +
      feasibility * WEIGHTS.feasibility;
    return { id, impact, alignment, feasibility, final };
  });

  scored.sort((a, b) => b.final - a.final);

  const ranked: MeedRankedActionResult[] = scored
    .slice(0, topN)
    .map((row, i) => ({
      action_id: row.id,
      rank: i + 1,
      final_score: Number(row.final.toFixed(3)),
      impact_score: Number(row.impact.toFixed(2)),
      alignment_score: Number(row.alignment.toFixed(2)),
      feasibility_score: Number(row.feasibility.toFixed(2)),
      // Co-benefits are read from the catalog record itself by the results
      // screen, so nothing is invented here.
      evidence_summary: {},
    }));

  const nameOf = (id: string) => index.get(id)?.actionName ?? id;

  return {
    locode,
    ranked_actions: ranked,
    removed_actions: [
      ...[...blockedIds].map((id) => ({
        action_id: id,
        action_name: nameOf(id),
        removal_reason: "Sample legal restriction (mock data)",
        removal_source: "legal_hard_filter",
      })),
      ...[...excluded].map((id) => ({
        action_id: id,
        action_name: nameOf(id),
        removal_reason: "Excluded by your criteria",
        removal_source: "user_exclusion",
      })),
    ],
    metadata: {
      counts: {
        total_actions: all.length,
        valid_actions: actions.length,
        discarded_excluded: excluded.size,
        discarded_legal: blockedIds.size,
        ranked_actions: ranked.length,
      },
      weights: { ...WEIGHTS },
      hard_filter_evidence_by_action_id: Object.fromEntries(
        [...flaggedIds].map((id) => [
          id,
          { legal_assessment_present: false, legal_verdict_category: null },
        ]),
      ),
    },
    warnings: [],
  };
}
