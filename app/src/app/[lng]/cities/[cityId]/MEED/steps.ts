/**
 * The MEED+ wizard steps, in canonical order. Single source of truth for the
 * step bar, the overview progress cards, and step navigation.
 * (The prototype kept three diverging copies of this list — do not repeat that.)
 */
export interface MeedStep {
  key: string;
  /** URL segment under MEED/[inventory]/ */
  segment: string;
  /** i18n key in the `meed` namespace */
  labelKey: string;
}

export const MEED_WIZARD_STEPS: MeedStep[] = [
  { key: "emissions", segment: "emissions", labelKey: "step-emissions" },
  { key: "context", segment: "context", labelKey: "step-context" },
  { key: "regulations", segment: "regulations", labelKey: "step-regulations" },
  { key: "preferences", segment: "preferences", labelKey: "step-preferences" },
  { key: "policy", segment: "policy", labelKey: "step-policy" },
  { key: "finance", segment: "finance", labelKey: "step-finance" },
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
