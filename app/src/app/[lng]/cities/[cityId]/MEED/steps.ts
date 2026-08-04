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
  rankingWeight?: number;
  /** The ranking still works without it. */
  optional?: boolean;
}

export const MEED_WIZARD_STEPS: MeedStep[] = [
  {
    key: "emissions",
    segment: "emissions",
    labelKey: "step-emissions",
    rankingWeight: 55,
  },
  {
    key: "context",
    segment: "context",
    labelKey: "step-context",
    rankingWeight: 23,
  },
  {
    key: "regulations",
    segment: "regulations",
    labelKey: "step-regulations",
    rankingWeight: 23,
  },
  {
    key: "preferences",
    segment: "preferences",
    labelKey: "step-preferences",
    rankingWeight: 22,
  },
  {
    key: "policy",
    segment: "policy",
    labelKey: "step-policy",
    rankingWeight: 22,
    optional: true,
  },
  {
    key: "finance",
    segment: "finance",
    labelKey: "step-finance",
    rankingWeight: 23,
  },
  { key: "preflight", segment: "preflight", labelKey: "step-preflight" },
];

export function getMeedPath(
  lng: string,
  cityId: string,
  inventoryId: string,
  segment?: string,
): string {
  const base = `/${lng}/cities/${cityId}/MEED/${inventoryId}`;
  return segment ? `${base}/${segment}` : base;
}
