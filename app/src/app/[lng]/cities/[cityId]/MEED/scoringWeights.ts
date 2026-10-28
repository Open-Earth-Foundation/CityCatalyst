/**
 * Starting position of the pre-flight weight sliders.
 *
 * SOURCE OF TRUTH: `DEFAULT_WEIGHTS` in
 * `hiap-meed/app/modules/prioritizer/scoring_config.py`. hiap-meed does not
 * expose its defaults, so the sliders have to start somewhere; nothing else in
 * the UI may print these numbers. Every displayed weight comes from the
 * ranking's own `metadata.weights` (see `readRankingWeights`).
 */
export const PILLAR_WEIGHTS = {
  impact: 0.55,
  alignment: 0.22,
  feasibility: 0.23,
} as const;

export type MeedPillar = keyof typeof PILLAR_WEIGHTS;
