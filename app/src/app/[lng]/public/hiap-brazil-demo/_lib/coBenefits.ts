/**
 * Co-benefits — methodology §6.1: eight categories on a −2…+2 scale, with
 * per-link suppression where a co-benefit is already credited in the
 * AdaptaBrasil Impact score. The overlap map below follows the document's
 * example table (water quality ↔ water stress; habitat and housing partially).
 */
import type {
  AdaptationAction,
  CoBenefitKey,
  Localized,
  RiskCellKey,
} from "./types";
import { localized as l } from "./localized";

export const CO_BENEFIT_KEYS: CoBenefitKey[] = [
  "social_equity",
  "public_health",
  "housing",
  "air_quality",
  "water_quality",
  "biodiversity",
  "mobility",
  "local_economy",
];

export const CO_BENEFIT_LABEL: Record<CoBenefitKey, Localized> = {
  social_equity: l(
    "Social equity and community capacity",
    "Equidade social e capacidade comunitária",
  ),
  public_health: l("Public health", "Saúde pública"),
  housing: l("Affordable and adequate housing", "Moradia adequada e acessível"),
  air_quality: l("Air quality", "Qualidade do ar"),
  water_quality: l("Water quality", "Qualidade da água"),
  biodiversity: l(
    "Biodiversity, habitats and ecosystem services",
    "Biodiversidade, habitats e serviços ecossistêmicos",
  ),
  mobility: l(
    "Mobility and access to services",
    "Mobilidade e acesso a serviços",
  ),
  local_economy: l(
    "Local economic development",
    "Desenvolvimento econômico local",
  ),
};

/** Co-benefit → risk cells whose Impact credit already contains it. */
const OVERLAP: Partial<Record<CoBenefitKey, RiskCellKey[]>> = {
  water_quality: ["water_stress"],
  biodiversity: ["biome_integrity"],
  housing: ["floods", "landslide"],
};

/** Co-benefits suppressed for this action because a credited link overlaps. */
export function suppressedCoBenefits(action: AdaptationAction): CoBenefitKey[] {
  const credited = new Set(
    action.links
      .filter((link) => link.directness === "direct")
      .map((link) => link.cell),
  );
  return (Object.keys(action.coBenefits) as CoBenefitKey[]).filter((key) =>
    (OVERLAP[key] ?? []).some((cell) => credited.has(cell)),
  );
}

/** Mean of the city's priority co-benefits, mapped to 0–1; 0.5 with no input. */
export function coBenefitMatch(
  action: AdaptationAction,
  priorities: CoBenefitKey[],
): number {
  if (priorities.length === 0) return 0.5;
  const suppressed = new Set(suppressedCoBenefits(action));
  const scored = priorities
    .filter((key) => !suppressed.has(key))
    .map((key) => ((action.coBenefits[key] ?? 0) + 2) / 4);
  if (scored.length === 0) return 0.5;
  return scored.reduce((sum, v) => sum + v, 0) / scored.length;
}
