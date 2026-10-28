/**
 * Policy-alignment aggregates by scope (national / regional / municipal).
 *
 * Ported from the MEED+ prototype (lib/policyAggregates.ts). National is the
 * mean policy_support_score; regional/municipal are the mean of the strongest
 * supporting evidence per action at that scope (null when no plan covers it).
 */

export type PolicyScope = "National" | "Regional" | "Municipal";

export interface PolicyEvidenceLike {
  signal_strength?: string;
  document_type?: string;
  evidence_strength?: number;
}

export interface PolicyScoreLike {
  src_action_id: string;
  policy_support_score: number;
  policy_evidence?: PolicyEvidenceLike[];
}

export interface PolicyAggregates {
  national: number | null;
  regional: number | null;
  municipal: number | null;
}

export const SIGNAL_STRENGTH_NUM: Record<string, number> = {
  high: 0.7,
  medium: 0.4,
  low: 0.2,
};

// The API tags each policy document via document_type: parcc → regional plan,
// paccc → municipal plan, everything else (ndc, framework, sector_plan, …) → national.
export function docScope(docType?: string): PolicyScope {
  if (docType === "parcc") return "Regional";
  if (docType === "paccc") return "Municipal";
  return "National";
}

function mean(vals: number[]): number | null {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function computePolicyAggregates(
  scores: PolicyScoreLike[],
): PolicyAggregates {
  const regVals: number[] = [];
  const munVals: number[] = [];

  for (const score of scores) {
    const scopeMax: Record<PolicyScope, number | null> = {
      National: null,
      Regional: null,
      Municipal: null,
    };
    for (const ev of score.policy_evidence ?? []) {
      const scope = docScope(ev.document_type);
      const strengthNum =
        typeof ev.evidence_strength === "number"
          ? ev.evidence_strength
          : (SIGNAL_STRENGTH_NUM[ev.signal_strength ?? ""] ?? 0.2);
      scopeMax[scope] = Math.max(scopeMax[scope] ?? 0, strengthNum);
    }
    if (scopeMax.Regional !== null) regVals.push(scopeMax.Regional);
    if (scopeMax.Municipal !== null) munVals.push(scopeMax.Municipal);
  }

  return {
    national: mean(scores.map((s) => s.policy_support_score)),
    regional: mean(regVals),
    municipal: mean(munVals),
  };
}
