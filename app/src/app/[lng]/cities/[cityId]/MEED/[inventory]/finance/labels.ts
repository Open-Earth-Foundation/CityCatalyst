/**
 * Enum → label / tone maps and small formatting helpers for the financial
 * feasibility screen. Kept out of the screen file so the same mapping is used
 * by the table, the profile card and the expanded detail.
 */

import type { TFunction } from "i18next";
import type { MeedTone } from "../../components/MeedStatusTag";
import type { FeasibilityRow } from "./types";

// ─── Financing routes ─────────────────────────────────────────────────────────

/** One key per route the feasibility endpoint emits, plus a fallback. */
export type RouteKey =
  | "self"
  | "ownBudget"
  | "technicalAssistance"
  | "cofinance"
  | "support"
  | "other";

export const ROUTE_ORDER: RouteKey[] = [
  "self",
  "ownBudget",
  "technicalAssistance",
  "cofinance",
  "support",
  "other",
];

export const ROUTE_META: Record<
  RouteKey,
  { labelKey: string; taglineKey: string; tone: MeedTone }
> = {
  self: {
    labelKey: "route-self",
    taglineKey: "route-self-tagline",
    tone: "positive",
  },
  ownBudget: {
    labelKey: "route-own-budget",
    taglineKey: "route-own-budget-tagline",
    tone: "positive",
  },
  technicalAssistance: {
    labelKey: "route-technical-assistance",
    taglineKey: "route-technical-assistance-tagline",
    tone: "info",
  },
  cofinance: {
    labelKey: "route-cofinance",
    taglineKey: "route-cofinance-tagline",
    tone: "warning",
  },
  support: {
    labelKey: "route-support",
    taglineKey: "route-support-tagline",
    tone: "negative",
  },
  other: {
    labelKey: "route-unknown",
    taglineKey: "route-unknown-tagline",
    tone: "neutral",
  },
};

/**
 * Maps the endpoint's `route` string to a key, one-to-one: "self-deliverable",
 * "own-budget feasible", "needs technical assistance", "needs external
 * co-finance", "needs external finance + TA / pooling". Routes are never
 * merged, so every count quotes what the endpoint said.
 */
export function routeKeyOf(route: string | null | undefined): RouteKey {
  const k = (route ?? "").toLowerCase();
  if (!k) return "other";
  if (k.includes("self-deliverable")) return "self";
  if (k.includes("own-budget") || k.includes("own budget")) return "ownBudget";
  if (k.includes("co-finance")) return "cofinance";
  if (k.includes("pooling") || k.includes("ta /")) return "support";
  if (k.includes("technical assistance")) return "technicalAssistance";
  return "other";
}

// Both routes mean the city's own budget covers the action, so external
// financing is optional and sector-level funds are reframed as such.
export function isSelfFundable(route: string | null | undefined): boolean {
  const key = routeKeyOf(route);
  return key === "self" || key === "ownBudget";
}

/**
 * Label for the reachable-funds count, following the endpoint's
 * `inputs.finance.fund_access` ("direct" | "competitive").
 */
export function fundAccessLabelKey(
  fundAccess: string | null | undefined,
): string {
  const k = (fundAccess ?? "").toLowerCase();
  if (k === "direct") return "fund-access-direct";
  if (k === "competitive") return "fund-access-competitive";
  return "fund-access-count";
}

/** Only the "self-deliverable" route — not "own-budget feasible". */
export function countSelfDeliverable(rows: FeasibilityRow[]): number {
  return rows.filter((row) => routeKeyOf(row.route) === "self").length;
}

// ─── Levels & city profile ────────────────────────────────────────────────────

export type Level = "low" | "lower" | "medium" | "high" | "higher";

export const LEVEL_KEYS: Record<Level, string> = {
  low: "level-low",
  lower: "level-lower",
  medium: "level-medium",
  high: "level-high",
  higher: "level-higher",
};

/** 0..1 fill for the level meter. */
export const LEVEL_VALUE: Record<Level, number> = {
  low: 0.2,
  lower: 0.3,
  medium: 0.5,
  high: 0.8,
  higher: 0.95,
};

export function numericToLevel(
  v: number | undefined | null,
): Level | undefined {
  if (v === undefined || v === null) return undefined;
  if (v <= 0.33) return "low";
  if (v <= 0.67) return "medium";
  return "high";
}

/**
 * Tone for a level. `needs` factors (capital intensity, preparation complexity)
 * are good when low; `has` factors (autonomy, capacity) are good when high.
 */
export function levelTone(level: Level, dir: "needs" | "has"): MeedTone {
  if (dir === "needs") {
    if (level === "low" || level === "lower") return "positive";
    if (level === "medium") return "warning";
    return "negative";
  }
  if (level === "high" || level === "higher") return "positive";
  return "warning";
}

export interface ProfileAttrs {
  labelKey: string;
  descKey: string;
  fa?: Level;
  dc?: Level;
}

/**
 * The endpoint's city archetype. Upstream bands financial autonomy and
 * delivery capacity at 0.5 into four archetypes, so the meters can only say
 * "higher" or "lower" — the endpoint does not return the underlying numbers.
 * A missing or unrecognised profile gets no meters and no claims.
 */
export function profileAttrs(profile: string | null | undefined): ProfileAttrs {
  const p = (profile ?? "").toLowerCase().replace(/[_ ]/g, "-");
  if (p.includes("self-sufficient")) {
    return {
      labelKey: "profile-self-sufficient",
      descKey: "profile-self-sufficient-desc",
      fa: "higher",
      dc: "higher",
    };
  }
  if (p.includes("delivery-ready")) {
    return {
      labelKey: "profile-delivery-ready",
      descKey: "profile-delivery-ready-desc",
      fa: "lower",
      dc: "higher",
    };
  }
  if (p.includes("well-resourced")) {
    return {
      labelKey: "profile-well-resourced",
      descKey: "profile-well-resourced-desc",
      fa: "higher",
      dc: "lower",
    };
  }
  if (p.includes("support-ready")) {
    return {
      labelKey: "profile-support-ready",
      descKey: "profile-support-ready-desc",
      fa: "lower",
      dc: "lower",
    };
  }
  return {
    labelKey: "profile-unknown",
    descKey: "profile-unknown-desc",
  };
}

// ─── Scores, statuses, amounts ────────────────────────────────────────────────

/** Text colour matching a `MeedTone`, for numbers shown next to a meter. */
export const TONE_TEXT_COLOR: Record<MeedTone, string> = {
  neutral: "content.tertiary",
  info: "content.link",
  positive: "sentiment.positiveDefault",
  warning: "sentiment.warningDefault",
  caution: "interactive.quaternary",
  negative: "sentiment.negativeDefault",
};

/**
 * Feasibility score → the standard four-level scale: High (green), Medium
 * (yellow), Low (orange), Very low (red). 0.7 is where the endpoint's routes
 * stop needing external money, so it stays the "High" line.
 */
export type ScoreLevel = "high" | "medium" | "low" | "veryLow";

export function scoreLevel(v: number): ScoreLevel {
  if (v >= 0.7) return "high";
  if (v >= 0.55) return "medium";
  if (v >= 0.4) return "low";
  return "veryLow";
}

export const SCORE_LEVEL_META: Record<
  ScoreLevel,
  { labelKey: string; tone: MeedTone }
> = {
  high: { labelKey: "score-level-high", tone: "positive" },
  medium: { labelKey: "score-level-medium", tone: "warning" },
  low: { labelKey: "score-level-low", tone: "caution" },
  veryLow: { labelKey: "score-level-very-low", tone: "negative" },
};

export function scoreTone(v: number): MeedTone {
  return SCORE_LEVEL_META[scoreLevel(v)].tone;
}

/** Humanize a data enum (e.g. "stationary_energy" → "Stationary Energy"). */
export function humanizeEnum(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const STATUS_KEYS: Record<string, string> = {
  open: "status-open",
  ongoing: "status-ongoing",
  closed: "status-closed",
  periodic: "status-periodic",
  emerging: "status-emerging",
  in_rollout: "status-in-rollout",
};

export const STATUS_TONE: Record<string, MeedTone> = {
  open: "info",
  ongoing: "positive",
  closed: "neutral",
  periodic: "info",
  emerging: "neutral",
  in_rollout: "info",
};

export function lifecycleTone(stage: string | undefined): MeedTone {
  const l = (stage ?? "").toLowerCase();
  if (l.includes("execut") || l.includes("progress") || l.includes("ongoing")) {
    return "warning";
  }
  if (l.includes("complet") || l.includes("finish")) return "positive";
  if (l.includes("plan") || l.includes("formul") || l.includes("apprais")) {
    return "info";
  }
  return "neutral";
}

/** `null` for a confidence value the endpoint has not used before. */
export function confidenceMeta(confidence: string | null | undefined): {
  labelKey: string;
  tone: MeedTone;
} | null {
  const l = (confidence ?? "").toLowerCase();
  if (l.includes("strong"))
    return { labelKey: "match-strong", tone: "positive" };
  if (l.includes("goal")) return { labelKey: "match-goal", tone: "info" };
  return null;
}

/** Multiplier to CLP millions for each `amount_unit` the endpoint reports. */
const CLP_UNIT_TO_MILLIONS: Record<string, number> = {
  CLP: 1 / 1_000_000,
  CLP_thousands: 1 / 1_000,
  CLP_millions: 1,
};

/**
 * Formats a project amount using the row's own `amount_unit`. Returns `null`
 * for a missing amount or a unit this screen does not know, rather than
 * guessing a scale.
 */
export function formatClpAmount(
  val: number | null | undefined,
  unit: string | null | undefined,
  t: TFunction,
): string | null {
  if (!val || val <= 0) return null;
  const factor = unit ? CLP_UNIT_TO_MILLIONS[unit] : undefined;
  if (factor === undefined) return null;
  const millions = val * factor;
  if (millions >= 1_000_000) {
    return t("amount-clp-t", { value: (millions / 1_000_000).toFixed(1) });
  }
  if (millions >= 1_000) {
    return t("amount-clp-b", { value: (millions / 1_000).toFixed(1) });
  }
  if (millions >= 1) {
    return t("amount-clp-m", { value: Math.round(millions) });
  }
  return t("amount-clp-k", { value: Math.round(millions * 1_000) });
}

// ─── Table layout & sorting ───────────────────────────────────────────────────

/**
 * Column widths, summing to 100%. Without these the table collapses.
 * Route carries the longest chip ("Needs external finance + TA"), so it gets more
 * room than the numeric columns, which only ever hold a short value.
 */
export const FINANCE_COLUMN_WIDTHS = [
  "34%",
  "15%",
  "23%",
  "13%",
  "15%",
] as const;

export type SortDirection = "asc" | "desc";

/**
 * Rows arrive from the API pre-sorted by feasibility. Sorting here is explicit
 * so the table can show which column it is ordered by.
 */
export function sortByFeasibility(
  rows: FeasibilityRow[],
  direction: SortDirection,
): FeasibilityRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) => (a.financial_feasibility - b.financial_feasibility) * factor,
  );
}

// Moved to the module root — shared components need it too. Re-exported here
// so the existing import sites keep working.
export { FOCUS_RING } from "../../focusRing";
