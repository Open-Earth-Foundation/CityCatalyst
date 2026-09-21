/**
 * Row derivation and display maps for the policy-alignment screen.
 *
 * Split out of `page.tsx` so the screen file is layout only, and so the
 * tone/label maps are declared once instead of once per component.
 */

import type { MeedTone } from "../../components/MeedStatusTag";
import {
  docScope,
  SIGNAL_STRENGTH_NUM,
  type PolicyScope,
} from "./policyAggregates";

// ─── Local view of the Global API action-policy-scores response ──────────────
// (`useGetMeedPolicyScoresQuery` is typed `unknown` — see MeedGlobalApiService.)

export interface PolicyEvidence {
  signal_type?: string;
  signal_strength?: string;
  document_name?: string;
  document_type?: string;
  evidence_strength?: number;
}

export interface PolicyScore {
  src_action_id: string;
  policy_support_score: number;
  policy_evidence?: PolicyEvidence[];
}

export function extractScores(data: unknown): PolicyScore[] {
  if (!data || typeof data !== "object") return [];
  const scores = (data as { scores?: unknown }).scores;
  if (!Array.isArray(scores)) return [];
  return scores.filter(
    (s): s is PolicyScore =>
      !!s &&
      typeof s === "object" &&
      typeof (s as PolicyScore).src_action_id === "string" &&
      typeof (s as PolicyScore).policy_support_score === "number",
  );
}

// ─── Derived per-action rows ──────────────────────────────────────────────────

export interface ActionPolicyRow {
  id: string;
  score: number;
  scopeMax: Record<PolicyScope, number | null>;
  evidence: PolicyEvidence[];
}

export function evidenceStrengthNum(ev: PolicyEvidence): number {
  return typeof ev.evidence_strength === "number"
    ? ev.evidence_strength
    : (SIGNAL_STRENGTH_NUM[ev.signal_strength ?? ""] ?? 0.2);
}

export interface PolicyDerived {
  rows: ActionPolicyRow[];
  planCounts: Record<PolicyScope, number>;
  coverage: Record<PolicyScope, number>;
}

export function derivePolicyRows(scores: PolicyScore[]): PolicyDerived {
  const planNames: Record<PolicyScope, Set<string>> = {
    National: new Set(),
    Regional: new Set(),
    Municipal: new Set(),
  };
  const coverage: Record<PolicyScope, number> = {
    National: 0,
    Regional: 0,
    Municipal: 0,
  };

  const rows = scores.map((score) => {
    const scopeMax: Record<PolicyScope, number | null> = {
      National: null,
      Regional: null,
      Municipal: null,
    };
    for (const ev of score.policy_evidence ?? []) {
      const scope = docScope(ev.document_type);
      scopeMax[scope] = Math.max(scopeMax[scope] ?? 0, evidenceStrengthNum(ev));
      if (ev.document_name) planNames[scope].add(ev.document_name);
    }
    for (const scope of ["National", "Regional", "Municipal"] as const) {
      if (scopeMax[scope] !== null) coverage[scope] += 1;
    }
    return {
      id: score.src_action_id,
      score: score.policy_support_score,
      scopeMax,
      evidence: score.policy_evidence ?? [],
    };
  });

  rows.sort((a, b) => b.score - a.score);

  return {
    rows,
    planCounts: {
      National: planNames.National.size,
      Regional: planNames.Regional.size,
      Municipal: planNames.Municipal.size,
    },
    coverage,
  };
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

export type PolicySortKey = "score" | PolicyScope;
export type SortDirection = "asc" | "desc";

function sortValue(row: ActionPolicyRow, key: PolicySortKey): number | null {
  return key === "score" ? row.score : row.scopeMax[key];
}

/**
 * Rows arrive from the API pre-sorted by policy support. Sorting here is
 * explicit so the table can show which column it is ordered by; nulls (no plan
 * on record) always sink to the bottom regardless of direction.
 */
export function sortPolicyRows(
  rows: ActionPolicyRow[],
  key: PolicySortKey,
  direction: SortDirection,
): ActionPolicyRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * factor;
  });
}

// ─── Display maps ─────────────────────────────────────────────────────────────

/** Text colour matching a `MeedTone`, for numbers and labels next to a meter. */
export const TONE_TEXT_COLOR: Record<MeedTone, string> = {
  neutral: "content.tertiary",
  info: "content.link",
  positive: "sentiment.positiveDefault",
  warning: "sentiment.warningDefault",
  negative: "sentiment.negativeDefault",
};

export function scoreTone(score: number | null): MeedTone {
  if (score === null) return "neutral";
  if (score >= 0.75) return "positive";
  if (score >= 0.4) return "warning";
  return "neutral";
}

export function alignmentLabelKey(score: number | null): string {
  if (score === null) return "alignment-no-plan";
  if (score >= 0.75) return "alignment-strong";
  if (score >= 0.4) return "alignment-moderate";
  return "alignment-limited";
}

export const SIGNAL_TYPE_KEYS: Record<string, string> = {
  action: "signal-action",
  funding: "signal-funding",
  governance: "signal-governance",
  sector_priority: "signal-sector",
  target: "signal-target",
};

export const STRENGTH_LABEL_KEYS: Record<string, string> = {
  high: "strength-high",
  medium: "strength-medium",
  low: "strength-low",
};

export const STRENGTH_TONE: Record<string, MeedTone> = {
  high: "positive",
  medium: "warning",
  low: "neutral",
};

export const SCOPE_TONE: Record<PolicyScope, MeedTone> = {
  National: "info",
  Regional: "warning",
  Municipal: "positive",
};

export const SCOPE_LABEL_KEYS: Record<PolicyScope, string> = {
  National: "scope-national",
  Regional: "scope-regional",
  Municipal: "scope-municipal",
};

/** Column widths, summing to 100%. Without these the table collapses. */
export const POLICY_COLUMN_WIDTHS = [
  "40%",
  "15%",
  "15%",
  "15%",
  "15%",
] as const;
