/**
 * The row model behind the proposal screens (BR-N1, BR-N6): one ranked action
 * with every band the table, the cards and the drawer print. Built once per
 * render from the fixtures and the city's current inputs, so the three views
 * can never disagree about a band.
 *
 * Colour rule for the proposal screens: no colour for priority (the order
 * is the ranking); green / amber / red mean favourable / moderate /
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
  /** The city's AdaptaBrasil index for that hazard, 0–1; sorts "by risk". */
  riskIndex: number;
  /** How many co-benefits the action delivers; sorts "by co-benefits". */
  benefitCount: number;
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
        riskIndex: hazard ? (city.risk[hazard]?.index ?? 0) : 0,
        benefitCount: Object.values(action.coBenefits).filter(
          (v) => (v ?? 0) > 0,
        ).length,
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

/** The eight facets of the list, in the two groups the filter bar shows. */
export type FacetKey =
  | "sector"
  | "hazard"
  | "level"
  | "benefit"
  | "cost"
  | "legal"
  | "funding"
  | "timeline";

/** What the action addresses. */
export const FACETS_ADDRESSES: FacetKey[] = [
  "sector",
  "hazard",
  "level",
  "benefit",
];
/** What it takes to deliver it. */
export const FACETS_TAKES: FacetKey[] = [
  "cost",
  "legal",
  "funding",
  "timeline",
];
export const FACET_KEYS: FacetKey[] = [...FACETS_ADDRESSES, ...FACETS_TAKES];

export type RowFilters = Record<FacetKey, string[]>;

export const EMPTY_FILTERS: RowFilters = {
  sector: [],
  hazard: [],
  level: [],
  benefit: [],
  cost: [],
  legal: [],
  funding: [],
  timeline: [],
};

/** Risk level of the hazard an action reduces, as a filter value. */
const LEVEL_OF_TONE: Partial<Record<MeedTone, string>> = {
  negative: "high",
  warning: "medium",
  positive: "low",
};
export const LEVEL_TONE: Record<string, MeedTone> = {
  high: "negative",
  medium: "warning",
  low: "positive",
};
/** Legal grades in three bins, the same green / amber / red as the levels. */
const LEGAL_BIN: Partial<Record<MeedTone, string>> = {
  positive: "feasible",
  warning: "adjustments",
  negative: "heavy",
};
/** Funding gaps in three bins, the same split as their colours. */
const FUNDING_BIN: Record<FundingGap, string> = {
  self_deliverable: "self",
  credit_available: "self",
  needs_technical_assistance: "support",
  needs_cofinance: "support",
  needs_cofinance_and_ta: "both",
};

/** Every value a row holds for a facet; an action can address several hazards. */
export function facetValues(row: RankedRow, key: FacetKey): string[] {
  switch (key) {
    case "sector":
      return [row.action.sector];
    case "hazard":
      return row.action.links
        .filter((l) => l.directness === "direct")
        .map((l) => l.cell as string);
    case "level":
      return [LEVEL_OF_TONE[row.riskTone] ?? "low"];
    case "benefit":
      return (Object.keys(row.action.coBenefits) as CoBenefitKey[]).filter(
        (k) => (row.action.coBenefits[k] ?? 0) > 0,
      );
    case "cost":
      return [row.cost];
    case "legal":
      return [LEGAL_BIN[row.legalTone] ?? "heavy"];
    case "funding":
      return [FUNDING_BIN[row.funding]];
    case "timeline":
      return [row.timeline];
  }
}

/**
 * One-click filters for what a city usually looks for first. Each is a
 * plain facet value, so it stays in sync with the dropdowns and the URL;
 * there is no priority label, the city finds its priorities itself.
 */
export const PRIORITY_SHORTCUTS: {
  id: string;
  key: FacetKey;
  value: string;
}[] = [
  { id: "high-risk", key: "level", value: "high" },
  { id: "low-cost", key: "cost", value: "low" },
  { id: "feasible", key: "legal", value: "feasible" },
  { id: "self", key: "funding", value: "self" },
  { id: "short", key: "timeline", value: "<5 years" },
];

export const hasActiveFilters = (f: RowFilters) =>
  FACET_KEYS.some((k) => f[k].length > 0);

/**
 * Filters narrow the list; they never touch a score. Within a facet any
 * selected value matches; across facets all must. `skip` leaves one facet
 * out, for the option counts.
 */
export function matchesFilters(
  row: RankedRow,
  f: RowFilters,
  skip?: FacetKey,
): boolean {
  return FACET_KEYS.every((k) => {
    if (k === skip || f[k].length === 0) return true;
    return facetValues(row, k).some((v) => f[k].includes(v));
  });
}

/** Booking-style count: how many rows an option would leave, given the other facets. */
export function facetCount(
  rows: RankedRow[],
  f: RowFilters,
  key: FacetKey,
  value: string,
): number {
  return rows.filter(
    (r) => matchesFilters(r, f, key) && facetValues(r, key).includes(value),
  ).length;
}

/** Filters live in the URL, so a filtered view can be shared. */
export function filtersFromSearch(search: string): RowFilters {
  const params = new URLSearchParams(search);
  const out: RowFilters = { ...EMPTY_FILTERS };
  for (const k of FACET_KEYS) {
    const raw = params.get(k);
    out[k] = raw ? raw.split(",").filter(Boolean) : [];
  }
  return out;
}

export function filtersToSearch(f: RowFilters): string {
  const params = new URLSearchParams();
  for (const k of FACET_KEYS) if (f[k].length) params.set(k, f[k].join(","));
  return params.toString();
}

export type SortKey =
  | "priority"
  | "risk"
  | "benefit"
  | "cost"
  | "legal"
  | "funding"
  | "policy"
  | "timeline";

export const SORT_KEYS: SortKey[] = [
  "priority",
  "risk",
  "benefit",
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
      case "risk":
        return -r.riskIndex;
      case "benefit":
        return -r.benefitCount;
      case "cost":
        return COST_ORDER[r.cost];
      case "legal":
        return -r.action.legal.score;
      case "funding":
        // T1 (self-deliverable) first … T4 last; localeCompare only gave ±1.
        return Number(r.fundingTier.slice(1));
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
