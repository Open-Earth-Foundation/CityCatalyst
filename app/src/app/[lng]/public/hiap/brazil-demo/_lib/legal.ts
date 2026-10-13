/**
 * Legal feasibility — methodology §5.1 as revised on Sep 21 2026: authority
 * and legislative competence per norm, combined into a 1–5 Delivery Capacity
 * Score with six grades.
 *
 * Open in the methodology: the locked hard filter is defined on a "blocked"
 * verdict that this scale no longer produces. The demo treats "Not feasible"
 * (score = 1) as the filter and says so on screen.
 */
import type {
  Localized,
  LegalAssessment,
  NormAuthority,
  NormCompetence,
} from "./types";
import type { MeedTone } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { localized as l } from "./localized";

export type LegalGrade =
  | "highly_feasible"
  | "feasible"
  | "feasible_with_adjustments"
  | "feasible_with_heavy_adjustments"
  | "least_feasible"
  | "not_feasible";

export function legalGrade(score: number): LegalGrade {
  if (score >= 5) return "highly_feasible";
  if (score >= 4) return "feasible";
  if (score >= 3) return "feasible_with_adjustments";
  if (score >= 2) return "feasible_with_heavy_adjustments";
  if (score > 1) return "least_feasible";
  return "not_feasible";
}

export const GRADE_LABEL: Record<LegalGrade, Localized> = {
  highly_feasible: l("Highly feasible", "Altamente viável"),
  feasible: l("Feasible", "Viável"),
  feasible_with_adjustments: l(
    "Feasible with adjustments",
    "Viável com ajustes",
  ),
  feasible_with_heavy_adjustments: l(
    "Feasible with heavy adjustments",
    "Viável com ajustes profundos",
  ),
  least_feasible: l("Least feasible", "Pouco viável"),
  not_feasible: l("Not feasible", "Inviável"),
};

export const GRADE_TONE: Record<LegalGrade, MeedTone> = {
  highly_feasible: "positive",
  feasible: "positive",
  feasible_with_adjustments: "info",
  feasible_with_heavy_adjustments: "warning",
  least_feasible: "warning",
  not_feasible: "negative",
};

/** The 1–5 score as a 0–1 pillar input. */
export const legalScore01 = (assessment: LegalAssessment) =>
  Math.max(0, Math.min(1, (assessment.score - 1) / 4));

export const isLegallyBlocked = (assessment: LegalAssessment) =>
  assessment.score <= 1;

export const AUTHORITY_LABEL: Record<NormAuthority, Localized> = {
  total: l("Total", "Total"),
  partial: l("Partial", "Parcial"),
  none: l("None", "Nenhuma"),
};

export const COMPETENCE_LABEL: Record<NormCompetence, Localized> = {
  exclusive: l("Exclusive", "Exclusiva"),
  supplementary: l("Supplementary", "Suplementar"),
  concurrent: l("Concurrent / private", "Concorrente / privativa"),
};

export const AUTHORITY_VALUE: Record<NormAuthority, number> = {
  total: 1,
  partial: 0.5,
  none: 0,
};

export const COMPETENCE_VALUE: Record<NormCompetence, number> = {
  exclusive: 1,
  supplementary: 0.66,
  concurrent: 0.33,
};

export const LEVEL_LABEL: Record<
  LegalAssessment["responsibleLevel"],
  Localized
> = {
  municipal: l("Municipal", "Municipal"),
  shared: l("Shared", "Compartilhado"),
  national: l("State / Union", "Estado / União"),
};
