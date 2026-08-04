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

/** Small deterministic hash so a given action always scores the same. */
function seededUnit(seed: string, salt: number): number {
  let hash = salt;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  // 0.28 … 0.95, avoiding the extremes so the bars all read plausibly.
  return 0.28 + ((hash % 1000) / 1000) * 0.67;
}

const WEIGHTS = { impact: 0.55, alignment: 0.22, feasibility: 0.23 };

export interface MeedMockOptions {
  locode: string;
  /** How many actions to rank. The rest count as legally excluded. */
  topN?: number;
}

export function buildMockRanking(
  index: MeedActionIndex,
  { locode, topN = 20 }: MeedMockOptions,
): MeedPrioritizeCityResult | null {
  const actions = [...index.values()].filter((a) => a.actionId);
  if (actions.length === 0) return null;

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

  return {
    locode,
    ranked_actions: ranked,
    metadata: {
      excluded_count: Math.max(0, actions.length - ranked.length),
      is_mock: true,
    },
    warnings: [],
  };
}
