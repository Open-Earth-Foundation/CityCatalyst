/**
 * The adaptation ranking, computed in the browser from fixtures.
 *
 * This is not the backend. It is the methodology's own arithmetic (§4.5–4.6,
 * §7.1) applied to the fixture action bank so that the five demo cities rank
 * differently for the reasons the document says they should — a zero municipal
 * index removes an action, hazards outside AdaptaBrasil sit apart, enabling
 * actions are shown but never scored. Every number on screen is illustrative.
 *
 * Open decisions are implemented one way and labelled as such in the UI:
 * hazard is displayed, not multiplied (doc §4.6; the Sep 15 weekly proposed
 * folding the overall risk index into vulnerability); finance tier scores and
 * Alignment component weights are placeholders (sign-off #17, #18).
 */
import type { MeedRankedActionResult } from "@/util/types/meed";
import type {
  AdaptationAction,
  CityFixture,
  DemoPreferences,
  RiskCellKey,
  RiskLink,
} from "./types";
import { fundingResult, TIER_SCORE } from "./finance";
import { isLegallyBlocked, legalScore01 } from "./legal";
import { coBenefitMatch } from "./coBenefits";
import { pick } from "./localized";
import { RISK_CELL_BY_KEY, SECTOR_LABEL } from "./riskCells";

export const EFFECTIVENESS_WEIGHT = {
  high: 1.0,
  medium: 0.5,
  low: 0.25,
} as const;
export const CONFIDENCE_FACTOR = {
  high: 1.25,
  medium: 1.0,
  low: 0.75,
} as const;
export const TIME_FACTOR = {
  "<5 years": 1.0,
  "5-10 years": 0.75,
  ">10 years": 0.5,
} as const;
export const MALADAPTATION_FACTOR = 0.75;

/** Placeholder Alignment component weights — sign-off item #17. */
export const ALIGNMENT_WEIGHTS = {
  policy: 0.5,
  coBenefits: 0.25,
  priorities: 0.25,
} as const;

export function componentScore(
  link: RiskLink,
  action: AdaptationAction,
): number {
  if (link.directness !== "direct" || !link.effectiveness || !link.confidence)
    return 0;
  const raw =
    EFFECTIVENESS_WEIGHT[link.effectiveness] *
    CONFIDENCE_FACTOR[link.confidence] *
    TIME_FACTOR[action.timeline] *
    (link.maladaptation ? MALADAPTATION_FACTOR : 1);
  return Math.min(1, raw);
}

export interface CellImpact {
  cell: RiskCellKey;
  adjustedVulnerability: number;
  adjustedExposure: number;
  /** 1 − (1 − adjV)(1 − adjE). */
  raw: number;
  /** City hazard value for context only. */
  hazard: number;
}

export function cellImpacts(
  action: AdaptationAction,
  city: CityFixture,
): CellImpact[] {
  const cells = new Map<RiskCellKey, CellImpact>();
  for (const link of action.links) {
    if (link.directness !== "direct") continue;
    const reading = city.risk[link.cell];
    if (!reading || !RISK_CELL_BY_KEY[link.cell].hasComponents) continue;
    const score = componentScore(link, action);
    const entry = cells.get(link.cell) ?? {
      cell: link.cell,
      adjustedVulnerability: 0,
      adjustedExposure: 0,
      raw: 0,
      hazard: reading.hazard,
    };
    if (link.component === "vulnerability") {
      entry.adjustedVulnerability = Math.min(1, score * reading.vulnerability);
    } else {
      entry.adjustedExposure = Math.min(1, score * reading.exposure);
    }
    entry.raw =
      1 - (1 - entry.adjustedVulnerability) * (1 - entry.adjustedExposure);
    cells.set(link.cell, entry);
  }
  return [...cells.values()].sort((a, b) => b.raw - a.raw);
}

export type NotRankedReason =
  | "outside_coverage"
  | "no_impact_here"
  | "complementary"
  | "legally_blocked"
  | "excluded_by_city";

export interface NotRankedAction {
  action: AdaptationAction;
  reason: NotRankedReason;
}

export interface ScoredAction {
  action: AdaptationAction;
  cells: CellImpact[];
  rawImpact: number;
  impact: number;
  legal: number;
  finance: number;
  feasibility: number;
  policy: number;
  coBenefits: number;
  priorities: number;
  alignment: number;
  final: number;
  rank: number;
  /** Which pillar inputs fell back to the 0.5 neutral value. */
  fallbacks: string[];
}

export interface AdaptationRanking {
  city: CityFixture;
  ranked: ScoredAction[];
  notRanked: NotRankedAction[];
  weights: DemoPreferences["weights"];
}

function prioritiesMatch(
  action: AdaptationAction,
  prefs: DemoPreferences,
): number {
  const parts: number[] = [];
  if (prefs.sectors.length > 0)
    parts.push(prefs.sectors.includes(action.sector) ? 1 : 0.3);
  if (prefs.timeline.length > 0)
    parts.push(prefs.timeline.includes(action.timeline) ? 1 : 0.3);
  if (prefs.priorityRisks.length > 0) {
    const credited = action.links
      .filter((l) => l.directness === "direct")
      .map((l) => l.cell);
    parts.push(credited.some((c) => prefs.priorityRisks.includes(c)) ? 1 : 0.4);
  }
  if (parts.length === 0) return 0.5;
  return parts.reduce((s, v) => s + v, 0) / parts.length;
}

export function rankAdaptation(
  city: CityFixture,
  actions: AdaptationAction[],
  prefs: DemoPreferences,
): AdaptationRanking {
  const notRanked: NotRankedAction[] = [];
  const candidates: Omit<ScoredAction, "impact" | "final" | "rank">[] = [];

  for (const action of actions) {
    if (prefs.excludedActionIds.includes(action.id)) {
      notRanked.push({ action, reason: "excluded_by_city" });
      continue;
    }
    if (action.uncoveredHazard) {
      notRanked.push({ action, reason: "outside_coverage" });
      continue;
    }
    if (action.kind === "enabling") {
      notRanked.push({ action, reason: "complementary" });
      continue;
    }
    if (isLegallyBlocked(action.legal)) {
      notRanked.push({ action, reason: "legally_blocked" });
      continue;
    }
    const cells = cellImpacts(action, city);
    const rawImpact = cells[0]?.raw ?? 0;
    if (rawImpact <= 0) {
      notRanked.push({ action, reason: "no_impact_here" });
      continue;
    }
    const fallbacks: string[] = [];
    const legal = legalScore01(action.legal);
    const finance = TIER_SCORE[fundingResult(action, city).tier];
    const feasibility = (legal + finance) / 2;
    const policy = action.policy.score / 100;
    const coBenefits = coBenefitMatch(action, prefs.coBenefits);
    if (prefs.coBenefits.length === 0) fallbacks.push("co_benefits");
    const priorities = prioritiesMatch(action, prefs);
    if (
      prefs.sectors.length === 0 &&
      prefs.timeline.length === 0 &&
      prefs.priorityRisks.length === 0
    ) {
      fallbacks.push("city_priorities");
    }
    const alignment =
      ALIGNMENT_WEIGHTS.policy * policy +
      ALIGNMENT_WEIGHTS.coBenefits * coBenefits +
      ALIGNMENT_WEIGHTS.priorities * priorities;
    candidates.push({
      action,
      cells,
      rawImpact,
      legal,
      finance,
      feasibility,
      policy,
      coBenefits,
      priorities,
      alignment,
      fallbacks,
    });
  }

  // §4.6 step 3: normalise within the municipality.
  const maxRaw = Math.max(...candidates.map((c) => c.rawImpact), 0);
  const w = prefs.weights;
  const total = w.impact + w.alignment + w.feasibility || 1;
  const scored = candidates
    .map((c) => {
      const impact = maxRaw > 0 ? c.rawImpact / maxRaw : 0;
      const final =
        (w.impact * impact +
          w.alignment * c.alignment +
          w.feasibility * c.feasibility) /
        total;
      return { ...c, impact, final, rank: 0 };
    })
    .sort(
      (a, b) => b.final - a.final || a.action.id.localeCompare(b.action.id),
    );
  scored.forEach((s, i) => (s.rank = i + 1));

  return { city, ranked: scored, notRanked, weights: prefs.weights };
}

/**
 * Narrative explanation. The product labels this "AI-assisted"; in the demo it
 * is a template, and the label says so.
 */
export function explainRanking(
  scored: ScoredAction,
  city: CityFixture,
  lng: string,
): string {
  const top = scored.cells[0];
  const cell = RISK_CELL_BY_KEY[top.cell];
  const reading = city.risk[top.cell]!;
  const sector = pick(SECTOR_LABEL[cell.sector], lng);
  const cellName = pick(cell.label, lng);
  const driver =
    top.adjustedVulnerability >= top.adjustedExposure
      ? lng === "pt"
        ? "vulnerabilidade"
        : "vulnerability"
      : lng === "pt"
        ? "exposição"
        : "exposure";
  const idx = (
    top.adjustedVulnerability >= top.adjustedExposure
      ? reading.vulnerability
      : reading.exposure
  ).toFixed(2);
  const lead =
    lng === "pt"
      ? `Em ${city.name}, esta ação é creditada na célula de risco “${cellName}” (${sector}) pelo componente de ${driver}, onde o índice municipal do AdaptaBrasil é ${idx}.`
      : `In ${city.name}, this action is credited in the “${cellName}” risk cell (${sector}) on the ${driver} component, where the city's AdaptaBrasil index is ${idx}.`;
  const rest =
    lng === "pt"
      ? ` O impacto normalizado no município é ${scored.impact.toFixed(2)}; a viabilidade (${scored.feasibility.toFixed(2)}) e o alinhamento (${scored.alignment.toFixed(2)}) completam a pontuação final de ${scored.final.toFixed(2)}, posição ${scored.rank}.`
      : ` Its normalised Impact in the municipality is ${scored.impact.toFixed(2)}; Feasibility (${scored.feasibility.toFixed(2)}) and Alignment (${scored.alignment.toFixed(2)}) complete a final score of ${scored.final.toFixed(2)}, rank ${scored.rank}.`;
  const hazardNote =
    reading.hazard === 0
      ? lng === "pt"
        ? " A ameaça climática é nula nesta célula; o resultado é exibido apenas para contexto."
        : " The climate hazard is absent in this cell; the result is shown for context only."
      : "";
  return lead + rest + hazardNote;
}

/** The ranked list in the shape the MEED results components consume. */
export function toRankedResults(
  ranking: AdaptationRanking,
  lng: string,
): MeedRankedActionResult[] {
  return ranking.ranked.map((s) => ({
    action_id: s.action.id,
    rank: s.rank,
    final_score: s.final,
    impact_score: s.impact,
    alignment_score: s.alignment,
    feasibility_score: s.feasibility,
    evidence_summary: {
      raw_impact: s.rawImpact,
      legal: s.legal,
      finance: s.finance,
      policy: s.policy,
      co_benefits: s.coBenefits,
      city_priorities: s.priorities,
      fallbacks: s.fallbacks,
    },
    explanations: {
      en: explainRanking(s, ranking.city, "en"),
      pt: explainRanking(s, ranking.city, "pt"),
      [lng]: explainRanking(s, ranking.city, lng),
    },
  }));
}
