/**
 * The row model behind the proposal screens (BR-N1, BR-N6): one ranked action
 * with every band the table, the cards and the drawer print. Built once per
 * render from the fixtures and the city's current inputs, so the three views
 * can never disagree about a band.
 *
 * Colour rule for the proposal screens: blue means priority (see
 * `PriorityTag`); green / amber / red mean favourable / moderate /
 * unfavourable on every assessment, and nothing else.
 */
import type { MeedRankedActionResult } from "@/util/types/meed";
import type { MeedTone } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import type {
  AdaptationAction,
  CoBenefitKey,
  CostBand,
  RiskCellKey,
  Timeline,
} from "../../_lib/types";
import type { ScoredAction, PriorityBand } from "../../_lib/ranking";
import { priorityBand } from "../../_lib/ranking";
import { GRADE_LABEL, legalGrade, type LegalGrade } from "../../_lib/legal";
import {
  fundingResult,
  GAP_LABEL,
  type FundingGap,
  type FundingTier,
} from "../../_lib/finance";
import { RISK_CELL_BY_KEY, SECTOR_LABEL } from "../../_lib/riskCells";
import { pick } from "../../_lib/localized";
import type { TrackData } from "../../_lib/useTrack";
import { indexTone } from "../RiskCellGrid";

export type PolicyGrade = "strong" | "medium" | "weak" | "none";

export function policyGrade(score: number): PolicyGrade {
  return score >= 66
    ? "strong"
    : score >= 33
      ? "medium"
      : score > 0
        ? "weak"
        : "none";
}

/** Favourable → unfavourable, one scale for every assessment. */
export const POLICY_TONE: Record<PolicyGrade, MeedTone> = {
  strong: "positive",
  medium: "warning",
  weak: "neutral",
  none: "neutral",
};

export const COST_TONE: Record<CostBand, MeedTone> = {
  low: "positive",
  medium: "warning",
  high: "negative",
};

export const GAP_TONE: Record<FundingGap, MeedTone> = {
  self_deliverable: "positive",
  credit_available: "positive",
  needs_technical_assistance: "warning",
  needs_cofinance: "warning",
  needs_cofinance_and_ta: "negative",
};

export function legalTone(grade: LegalGrade): MeedTone {
  switch (grade) {
    case "highly_feasible":
    case "feasible":
      return "positive";
    case "feasible_with_adjustments":
      return "warning";
    default:
      return "negative";
  }
}

const COST_ORDER: Record<CostBand, number> = { low: 0, medium: 1, high: 2 };
const TIMELINE_ORDER: Record<Timeline, number> = {
  "<5 years": 0,
  "5-10 years": 1,
  ">10 years": 2,
};
const POLICY_ORDER: Record<PolicyGrade, number> = {
  strong: 0,
  medium: 1,
  weak: 2,
  none: 3,
};

export interface RankedRow {
  action: AdaptationAction;
  scored: ScoredAction;
  result: MeedRankedActionResult;
  rank: number;
  total: number;
  band: PriorityBand;
  hazard: RiskCellKey | null;
  hazardLabel: string;
  /** The city's risk level for that hazard: red high, amber medium, green low. */
  riskTone: MeedTone;
  sectorLabel: string;
  cost: CostBand;
  legal: LegalGrade;
  legalLabel: string;
  legalTone: MeedTone;
  funding: FundingGap;
  fundingLabel: string;
  fundingTier: FundingTier;
  policy: PolicyGrade;
  timeline: Timeline;
}

export function buildRows(data: TrackData, lng: string): RankedRow[] {
  const { adaptation, ranked, city } = data;
  if (!adaptation) return [];
  const total = adaptation.ranked.length;
  const resultById = new Map(ranked.map((r) => [r.action_id, r]));
  return adaptation.ranked.flatMap((scored) => {
    const result = resultById.get(scored.action.id);
    if (!result) return [];
    const action = scored.action;
    const hazard = scored.cells[0]?.cell ?? null;
    const legal = legalGrade(action.legal.score);
    const funding = fundingResult(action, city);
    return [
      {
        action,
        scored,
        result,
        rank: scored.rank,
        total,
        band: priorityBand(scored.rank, total),
        hazard,
        hazardLabel: hazard ? pick(RISK_CELL_BY_KEY[hazard].label, lng) : "—",
        riskTone: hazard ? indexTone(city.risk[hazard]?.index ?? 0) : "neutral",
        sectorLabel: pick(SECTOR_LABEL[action.sector], lng),
        cost: action.costBand,
        legal,
        legalLabel: pick(GRADE_LABEL[legal], lng),
        legalTone: legalTone(legal),
        funding: funding.gap,
        fundingLabel: pick(GAP_LABEL[funding.gap], lng),
        fundingTier: funding.tier,
        policy: policyGrade(action.policy.score),
        timeline: action.timeline,
      },
    ];
  });
}

export interface RowFilters {
  sectors: string[];
  hazards: string[];
  coBenefits: string[];
  timelines: string[];
}

export const EMPTY_FILTERS: RowFilters = {
  sectors: [],
  hazards: [],
  coBenefits: [],
  timelines: [],
};

export const hasActiveFilters = (f: RowFilters) =>
  f.sectors.length +
    f.hazards.length +
    f.coBenefits.length +
    f.timelines.length >
  0;

/** Filters narrow the list; they never touch a score. */
export function matchesFilters(row: RankedRow, f: RowFilters): boolean {
  if (f.sectors.length && !f.sectors.includes(row.action.sector)) return false;
  if (f.timelines.length && !f.timelines.includes(row.timeline)) return false;
  if (f.hazards.length) {
    const credited = row.action.links
      .filter((l) => l.directness === "direct")
      .map((l) => l.cell as string);
    if (!credited.some((c) => f.hazards.includes(c))) return false;
  }
  if (f.coBenefits.length) {
    const delivers = f.coBenefits.some(
      (k) => (row.action.coBenefits[k as CoBenefitKey] ?? 0) > 0,
    );
    if (!delivers) return false;
  }
  return true;
}

export type SortKey =
  "priority" | "cost" | "legal" | "funding" | "policy" | "timeline";

export const SORT_KEYS: SortKey[] = [
  "priority",
  "cost",
  "legal",
  "funding",
  "policy",
  "timeline",
];

/** Stable sort on one column; ties fall back to the ranking order. */
export function sortRows(rows: RankedRow[], key: SortKey): RankedRow[] {
  const by = (r: RankedRow): number => {
    switch (key) {
      case "cost":
        return COST_ORDER[r.cost];
      case "legal":
        return -r.action.legal.score;
      case "funding":
        return r.fundingTier.localeCompare("T0");
      case "policy":
        return POLICY_ORDER[r.policy];
      case "timeline":
        return TIMELINE_ORDER[r.timeline];
      default:
        return r.rank;
    }
  };
  return [...rows].sort((a, b) => by(a) - by(b) || a.rank - b.rank);
}

/**
 * The city's own order: ids the city placed come first, in that order; the
 * rest follow in the suggested order. Ids no longer ranked are dropped.
 */
export function applyCityOrder(
  rows: RankedRow[],
  cityOrder: string[],
): RankedRow[] {
  if (cityOrder.length === 0) return rows;
  const byId = new Map(rows.map((r) => [r.action.id, r]));
  const placed = cityOrder.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  const placedIds = new Set(placed.map((r) => r.action.id));
  return [...placed, ...rows.filter((r) => !placedIds.has(r.action.id))];
}

/**
 * How many rows the city moved: the rows outside the longest run that still
 * follows the suggested order. Pinning one action to the top counts as one
 * move, not as every row below it shifting down.
 */
export function movedCount(rows: RankedRow[], ordered: RankedRow[]): number {
  const a = rows.map((r) => r.action.id);
  const b = ordered.map((r) => r.action.id);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return m - dp[n][m];
}
