/**
 * Enum → label / tone maps and small formatting helpers for the financial
 * feasibility screen. Kept out of the screen file so the same mapping is used
 * by the table, the profile card and the expanded detail.
 */

import type { TFunction } from "i18next";
import type { MeedTone } from "../../components/MeedStatusTag";
import type { FeasibilityRow } from "./types";

// ─── Financing routes ─────────────────────────────────────────────────────────

export type RouteKey = "self" | "cofinance" | "support" | "other";

export const ROUTE_ORDER: RouteKey[] = [
  "self",
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

export function routeKeyOf(route: string | null | undefined): RouteKey {
  const k = (route ?? "").toLowerCase();
  if (!k) return "other";
  if (
    k.includes("self-deliverable") ||
    k.includes("own-budget") ||
    k.includes("own budget")
  ) {
    return "self";
  }
  if (k.includes("co-finance")) return "cofinance";
  if (k.includes("pooling") || k.includes("ta /") || k.includes("support")) {
    return "support";
  }
  return "other";
}

// Actions the city can fund from its own budget don't need external financing;
// sector-level funds are reframed as optional (see the prototype's rationale).
export function isSelfFundable(route: string | null | undefined): boolean {
  return routeKeyOf(route) === "self";
}

export function countSelfDeliverable(rows: FeasibilityRow[]): number {
  return rows.filter((row) => isSelfFundable(row.route)).length;
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

export function profileAttrs(profile: string | undefined): ProfileAttrs {
  const p = (profile ?? "").toLowerCase().replace(/_/g, "-");
  if (p.includes("delivery-ready")) {
    return {
      labelKey: "profile-delivery-ready",
      descKey: "profile-delivery-ready-desc",
      fa: "lower",
      dc: "high",
    };
  }
  if (p.includes("financially-strong") || p.includes("self-sufficient")) {
    return {
      labelKey: "profile-financially-strong",
      descKey: "profile-financially-strong-desc",
      fa: "high",
      dc: "high",
    };
  }
  if (p.includes("revenue-strong")) {
    return {
      labelKey: "profile-revenue-strong",
      descKey: "profile-revenue-strong-desc",
      fa: "high",
      dc: "lower",
    };
  }
  if (p.includes("capacity-rich")) {
    return {
      labelKey: "profile-capacity-rich",
      descKey: "profile-capacity-rich-desc",
      fa: "lower",
      dc: "higher",
    };
  }
  return {
    labelKey: "profile-transitioning",
    descKey: "profile-transitioning-desc",
  };
}

// ─── Scores, statuses, amounts ────────────────────────────────────────────────

/** Text colour matching a `MeedTone`, for numbers shown next to a meter. */
export const TONE_TEXT_COLOR: Record<MeedTone, string> = {
  neutral: "content.tertiary",
  info: "content.link",
  positive: "sentiment.positiveDefault",
  warning: "sentiment.warningDefault",
  negative: "sentiment.negativeDefault",
};

export function scoreTone(v: number): MeedTone {
  if (v >= 0.7) return "positive";
  if (v >= 0.4) return "warning";
  return "neutral";
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
};

export const STATUS_TONE: Record<string, MeedTone> = {
  open: "info",
  ongoing: "positive",
  closed: "neutral",
};

export function lifecycleTone(stage: string | undefined): MeedTone {
  const l = (stage ?? "").toLowerCase();
  if (l.includes("execut") || l.includes("progress") || l.includes("ongoing")) {
    return "warning";
  }
  if (l.includes("complet") || l.includes("finish")) return "positive";
  if (l.includes("plan") || l.includes("formul")) return "info";
  return "neutral";
}

export function confidenceMeta(confidence: string | undefined): {
  labelKey: string;
  tone: MeedTone;
} {
  const l = (confidence ?? "").toLowerCase();
  if (l.includes("strong"))
    return { labelKey: "match-strong", tone: "positive" };
  if (l.includes("goal")) return { labelKey: "match-goal", tone: "info" };
  return { labelKey: "match-matched", tone: "neutral" };
}

// cost_total is in CLP millions per the API (amount_unit: "CLP_millions").
export function formatClpMillions(
  val: number | null | undefined,
  t: TFunction,
): string | null {
  if (!val || val <= 0) return null;
  if (val >= 1_000_000) {
    return t("amount-clp-t", { value: (val / 1_000_000).toFixed(1) });
  }
  if (val >= 1_000) {
    return t("amount-clp-b", { value: (val / 1_000).toFixed(1) });
  }
  return t("amount-clp-m", { value: Math.round(val) });
}

export function withLimit(link: string, limit: number): string {
  return `${link}${link.includes("?") ? "&" : "?"}limit=${limit}`;
}

// ─── Table layout & sorting ───────────────────────────────────────────────────

/**
 * Column widths, summing to 100%. Without these the table collapses.
 * Route carries the longest chip ("Needs finance & support"), so it gets more
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
