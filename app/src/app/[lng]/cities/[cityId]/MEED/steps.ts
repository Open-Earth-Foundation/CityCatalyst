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
    key: "emissions",
    segment: "emissions",
    labelKey: "step-emissions",
  },
  {
    key: "context",
    segment: "context",
    labelKey: "step-context",
  },
  {
    key: "regulations",
    segment: "regulations",
    labelKey: "step-regulations",
  },
  {
    key: "preferences",
    segment: "preferences",
    labelKey: "step-preferences",
  },
  {
    key: "policy",
    segment: "policy",
    labelKey: "step-policy",
    optional: true,
  },
  {
    key: "finance",
    segment: "finance",
    labelKey: "step-finance",
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
