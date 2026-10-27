import type { MeedTone } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import type { AdaptationAction, PolicyMatch } from "../../_lib/types";

export const MATCH_TONE: Record<PolicyMatch, MeedTone> = {
  direct: "positive",
  partial: "warning",
  adjacent: "neutral",
};

const MATCH_RANK: Record<PolicyMatch, number> = {
  direct: 0,
  partial: 1,
  adjacent: 2,
};

/** Plano Clima documents: the national adaptation strategy and its sectoral plans. */
export function isPlanoClimaDocument(document: string): boolean {
  return (
    document.startsWith("Plano Setorial de Adaptação") ||
    document.startsWith("Estratégia Nacional de Adaptação") ||
    document.startsWith("Plano Clima")
  );
}

export interface PlanoClimaLink {
  document: string;
  /** The strongest match among the passages that cite the action. */
  match: PolicyMatch;
  pages: number[];
}

/**
 * The Plano Clima plans that cite an action, read from its policy evidence:
 * one entry per document, strongest match first. Only what the evidence
 * records; a plan the corpus has not reached does not appear.
 */
export function planoClimaPlans(action: AdaptationAction): PlanoClimaLink[] {
  const byDoc = new Map<string, PlanoClimaLink>();
  for (const e of action.policy.evidence) {
    if (!isPlanoClimaDocument(e.document)) continue;
    const prev = byDoc.get(e.document);
    if (!prev) {
      byDoc.set(e.document, {
        document: e.document,
        match: e.match,
        pages: [e.page],
      });
    } else {
      if (MATCH_RANK[e.match] < MATCH_RANK[prev.match]) prev.match = e.match;
      if (!prev.pages.includes(e.page)) prev.pages.push(e.page);
    }
  }
  return [...byDoc.values()].sort(
    (a, b) => MATCH_RANK[a.match] - MATCH_RANK[b.match],
  );
}

/** Short name of a sectoral plan, for filters ("Recursos Hídricos"). */
export function planShortName(document: string): string {
  const m = document.match(/Plano Setorial de Adaptação — (.+)$/);
  if (m) return m[1];
  const ena = document.match(/\((ENA[^)]*)\)/);
  return ena ? ena[1] : document;
}
