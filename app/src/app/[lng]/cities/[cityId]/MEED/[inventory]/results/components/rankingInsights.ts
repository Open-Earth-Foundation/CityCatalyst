/**
 * Plain facts about a ranking, derived once so the summary card on the home
 * and results screens can say the same things. Nothing here is a judgement:
 * each field is a count or a share the caller turns into a sentence.
 */
import type { MeedRankedActionResult } from "@/util/types/meed";
import type { SectorEmission } from "@/util/types";
import type { MeedActionIndex } from "./actionCatalog";
import { scoreContributions, type MeedScoreWeights } from "./rankingFacts";
import { sectorShares } from "../../../components/sectorShares";
import { routeKeyOf } from "../../finance/labels";

export type MeedPillar = "impact" | "alignment" | "feasibility";

export interface MeedRankingInsights {
  rankedCount: number;
  /** Catalog sector tag (e.g. "stationary_energy") → ranked actions in it, largest first. */
  sectorCounts: { tag: string; count: number }[];
  /** The inventory's largest emitting sector and how many ranked actions target it. */
  topEmissionSector: {
    name: string;
    share: number;
    rankedCount: number;
  } | null;
  /** Mean share of each final score contributed by each pillar, 0..1. */
  driverShares: Record<MeedPillar, number>;
  /** The pillar with the largest mean share. */
  mainDriver: MeedPillar;
  /** Ranked actions the city can fund from its own budget, when finance data exists. */
  selfDeliverable: { count: number; total: number } | null;
  /** Ranked actions implementable in under five years. */
  shortTerm: { count: number; total: number };
}

/** Catalog tags use underscores; inventory sector names use hyphens. */
function sameSector(tag: string | null | undefined, name: string): boolean {
  if (!tag) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[_\s]+/g, "-");
  return norm(tag) === norm(name);
}

function isShortTerm(raw: string | null | undefined): boolean {
  const s = (raw ?? "").toLowerCase().replace(/\s+/g, "");
  return s.startsWith("<5") || s === "short" || s.includes("lessthan5");
}

export function rankingInsights({
  ranked,
  index,
  weights,
  bySector,
  financeRoutes,
}: {
  ranked: MeedRankedActionResult[];
  index: MeedActionIndex;
  weights: MeedScoreWeights;
  bySector?: SectorEmission[];
  /** action_id → raw financing route, from the finance feasibility rows. */
  financeRoutes?: Map<string, string | null | undefined>;
}): MeedRankingInsights {
  const rankedCount = ranked.length;

  const counts = new Map<string, number>();
  for (const a of ranked) {
    const tag = index.get(a.action_id)?.sectorTag;
    if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const sectorCounts = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  const top = sectorShares(bySector)[0];
  const topEmissionSector = top
    ? {
        name: top.name,
        share: top.share,
        rankedCount: ranked.filter((a) =>
          sameSector(index.get(a.action_id)?.sectorTag, top.name),
        ).length,
      }
    : null;

  const sums: Record<MeedPillar, number> = {
    impact: 0,
    alignment: 0,
    feasibility: 0,
  };
  let counted = 0;
  for (const a of ranked) {
    const parts = scoreContributions(a, weights);
    if (parts.total <= 0) continue;
    sums.impact += parts.impact / parts.total;
    sums.alignment += parts.alignment / parts.total;
    sums.feasibility += parts.feasibility / parts.total;
    counted += 1;
  }
  const driverShares: Record<MeedPillar, number> = {
    impact: counted ? sums.impact / counted : 0,
    alignment: counted ? sums.alignment / counted : 0,
    feasibility: counted ? sums.feasibility / counted : 0,
  };
  const mainDriver = (Object.keys(driverShares) as MeedPillar[]).reduce(
    (best, key) => (driverShares[key] > driverShares[best] ? key : best),
    "impact",
  );

  let selfDeliverable: MeedRankingInsights["selfDeliverable"] = null;
  if (financeRoutes && financeRoutes.size > 0) {
    const withRoute = ranked.filter((a) => financeRoutes.has(a.action_id));
    selfDeliverable = {
      total: withRoute.length,
      count: withRoute.filter(
        (a) => routeKeyOf(financeRoutes.get(a.action_id)) === "self",
      ).length,
    };
  }

  const shortTerm = {
    total: rankedCount,
    count: ranked.filter((a) =>
      isShortTerm(index.get(a.action_id)?.timelineForImplementation),
    ).length,
  };

  return {
    rankedCount,
    sectorCounts,
    topEmissionSector,
    driverShares,
    mainDriver,
    selfDeliverable,
    shortTerm,
  };
}
