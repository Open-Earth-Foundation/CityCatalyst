/**
 * The prioritizer's scoring weights, mirrored for display.
 *
 * SOURCE OF TRUTH: `hiap-meed/app/modules/prioritizer/scoring_config.py`.
 * These constants exist only so the UI can explain how a ranking was reached.
 * They must never be used to compute a score — the backend does that, and the
 * weights it actually used come back on `metadata.weights` (see
 * `readRankingWeights` in `results/components/rankingFacts.ts`).
 *
 * Before this file existed the same numbers were duplicated in four places
 * (`steps.ts`, `meedLocalState.ts`, `results/page.tsx`, and a set of hardcoded
 * percentages in the locale files) and had drifted into claiming that the six
 * wizard steps together shape 168% of the ranking.
 */

/** Pillar weights — `DEFAULT_WEIGHTS` in scoring_config.py. */
export const PILLAR_WEIGHTS = {
  impact: 0.55,
  alignment: 0.22,
  feasibility: 0.23,
} as const;

export type MeedPillar = keyof typeof PILLAR_WEIGHTS;

/** Within-pillar component splits. Each group sums to 1.0. */
export const IMPACT_COMPONENTS = {
  reductionShare: 0.8,
  timeline: 0.2,
} as const;

export const ALIGNMENT_COMPONENTS = {
  policy: 0.75,
  sector: 0.15,
  coBenefit: 0.05,
  timeframe: 0.05,
} as const;

export const FEASIBILITY_COMPONENTS = {
  legal: 0.34,
  mitigation: 0.33,
  financial: 0.33,
} as const;

export interface MeedStepContribution {
  /** Which pillar this step feeds. */
  pillar: MeedPillar;
  /** This step's share *of that pillar*, 0..1. */
  componentShare: number;
  /** This step's share of the whole ranking, as a percentage. */
  rankingShare: number;
}

/**
 * What each wizard step actually contributes to the ranking.
 *
 * `rankingShare = componentShare × PILLAR_WEIGHTS[pillar] × 100`, so the six
 * values sum to 100. Preferences carries the three non-policy alignment
 * components (sector + co-benefit + timeframe = 0.25), because that is what the
 * Strategic preferences screen collects.
 *
 * Emissions is credited with the whole impact pillar. Strictly it drives the
 * reduction-share component (80% of impact); the remaining 20% is the action
 * library's implementation timeline, which is not city data. Attributing that
 * 20% to a step nobody fills in would break the sum-to-100 property, so it sits
 * with emissions and the nuance lives in the tooltip.
 */
export const STEP_CONTRIBUTION: Record<string, MeedStepContribution> = {
  emissions: { pillar: "impact", componentShare: 1, rankingShare: 55 },
  policy: {
    pillar: "alignment",
    componentShare: ALIGNMENT_COMPONENTS.policy,
    rankingShare: 16.5,
  },
  preferences: {
    pillar: "alignment",
    componentShare:
      ALIGNMENT_COMPONENTS.sector +
      ALIGNMENT_COMPONENTS.coBenefit +
      ALIGNMENT_COMPONENTS.timeframe,
    rankingShare: 5.5,
  },
  regulations: {
    pillar: "feasibility",
    componentShare: FEASIBILITY_COMPONENTS.legal,
    rankingShare: 7.8,
  },
  context: {
    pillar: "feasibility",
    componentShare: FEASIBILITY_COMPONENTS.mitigation,
    rankingShare: 7.6,
  },
  finance: {
    pillar: "feasibility",
    componentShare: FEASIBILITY_COMPONENTS.financial,
    rankingShare: 7.6,
  },
};

/** Percentage with at most one decimal: 55 → "55", 16.5 → "16.5". */
export function formatShare(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A pillar's weight as a whole-number percentage, for copy. */
export function pillarPercent(pillar: MeedPillar): number {
  return Math.round(PILLAR_WEIGHTS[pillar] * 100);
}

/** A step's share of its pillar as a whole-number percentage, for copy. */
export function componentPercent(stepKey: string): number | null {
  const c = STEP_CONTRIBUTION[stepKey];
  return c ? Math.round(c.componentShare * 100) : null;
}
