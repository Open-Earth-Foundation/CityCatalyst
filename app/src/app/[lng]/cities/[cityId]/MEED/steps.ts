/**
 * The wizard steps, in canonical order. Single source of truth for the stepper,
 * the overview cards, the pre-flight summary and step navigation.
 * (The prototype kept three diverging copies of this list — do not repeat that.)
 */
export interface MeedStep {
  key: string;
  /** URL segment under MEED/[inventory]/ */
  segment: string;
  /** i18n key in the `meed` namespace; `${labelKey}-description` must also exist. */
  labelKey: string;
  /**
   * Roughly how much this input shapes the final ranking, as a percentage.
   * Surfaced on the overview cards and each screen so the user can see which
   * inputs are worth their time. `undefined` for the review step, which
   * contributes nothing itself.
   */
  /** The ranking still works without it. */
  optional?: boolean;
}

export const MEED_WIZARD_STEPS: MeedStep[] = [
  {
    key: "preferences",
    segment: "preferences",
    labelKey: "step-preferences",
  },
  { key: "preflight", segment: "preflight", labelKey: "step-preflight" },
];

/**
 * Areas the model computes rather than the city enters.
 *
 * Legal screening, policy alignment, financial feasibility and socioeconomic
 * context have no controls: they are read-only views of data the prioritizer
 * or the Global API produces. The emissions breakdown is read-only too: the
 * inventory is retrieved from CityCatalyst with one action on the home screen,
 * and this page only lets the user inspect what was pulled. Making them wizard
 * steps made the flow twice as long as the number of decisions in it and let
 * the readiness score award points for opening a page.
 *
 * They keep their routes and are reached from the home screen's context cards
 * and from the results screen, which is where their content explains something.
 */
export const MEED_OUTPUT_AREAS: MeedStep[] = [
  { key: "emissions", segment: "emissions", labelKey: "step-emissions" },
  { key: "context", segment: "context", labelKey: "step-context" },
  { key: "regulations", segment: "regulations", labelKey: "step-regulations" },
  { key: "policy", segment: "policy", labelKey: "step-policy" },
  { key: "finance", segment: "finance", labelKey: "step-finance" },
];

/** Every MEED screen that stores state, whether or not it is a wizard step. */
export const MEED_ALL_SECTIONS: MeedStep[] = [
  ...MEED_WIZARD_STEPS,
  ...MEED_OUTPUT_AREAS,
];

/**
 * The inputs a ranking is computed from, in fingerprint order. Emissions is no
 * longer a wizard step but it still feeds the ranking, so it stays in the
 * staleness check; keep the order stable or every stored ranking reports
 * itself stale after a deploy.
 */
export const MEED_RANKING_INPUT_KEYS = [
  "emissions",
  "preferences",
  "preflight",
] as const;

export function getMeedPath(
  lng: string,
  cityId: string,
  inventoryId: string,
  segment?: string,
): string {
  const base = `/${lng}/cities/${cityId}/MEED/${inventoryId}`;
  return segment ? `${base}/${segment}` : base;
}
