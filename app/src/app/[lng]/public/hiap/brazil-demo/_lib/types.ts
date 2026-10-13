/**
 * Data model for the Brazil Phase 3 HIAP demo.
 *
 * Everything here is fixture-shaped: it mirrors the adaptation methodology
 * (Methodology — Adaptation action prioritization, v1.0, Sep 2026) closely
 * enough that reviewers see the right *kinds* of information in the right
 * places, but none of it comes from a service. Values that the methodology
 * document states are marked in the fixture files; the rest are illustrative.
 */

/** Copy that exists in both demo languages. */
export interface Localized {
  en: string;
  pt: string;
}

export type DemoTrack = "adaptation" | "mitigation";

// ─── AdaptaBrasil risk framework ─────────────────────────────────────────────

export type AdaptaSector =
  | "water_resources"
  | "food_security"
  | "energy_security"
  | "geohydrological_disasters"
  | "health"
  | "biodiversity";

export type RiskCellKey =
  | "water_stress"
  | "food_availability"
  | "food_access"
  | "energy_access"
  | "energy_availability"
  | "floods"
  | "landslide"
  | "malaria"
  | "arboviruses"
  | "cutaneous_leishmaniasis"
  | "visceral_leishmaniasis"
  | "biome_integrity";

/** Hazards the module cannot rank because AdaptaBrasil has no municipal cell. */
export type UncoveredHazard = "sea_level_rise" | "extreme_heat";

export type RiskComponent = "hazard" | "exposure" | "vulnerability";

export interface RiskCell {
  key: RiskCellKey;
  sector: AdaptaSector;
  label: Localized;
  hazardLabel: Localized;
  /** Energy availability has no H/E/V breakdown in the current release. */
  hasComponents: boolean;
}

/** One city's AdaptaBrasil reading for one cell, 0–1, nationally normalised. */
export interface RiskReading {
  hazard: number;
  exposure: number;
  vulnerability: number;
  /** Published risk-of-impact index for context. */
  index: number;
  /** 2030 / 2050 projections — shown, never scored. */
  index2030: number;
  index2050: number;
}

// ─── Cities ──────────────────────────────────────────────────────────────────

export type CapagGrade = "A" | "B" | "C" | "D" | "nd";

export interface CityFixture {
  slug: string;
  name: string;
  state: string;
  locode: string;
  population: number;
  coastal: boolean;
  /** Present-day readings; `null` when AdaptaBrasil has no data for the cell. */
  risk: Partial<Record<RiskCellKey, RiskReading | null>>;
  capag: CapagGrade;
  /** IBGE MUNIC finance-push score, 0–14. */
  financePush: number;
  /** Socioeconomic context — displayed, never scored (methodology §5). */
  context: {
    povertyRate: number;
    informalSettlementShare: number;
    urbanShare: number;
    gdpPerCapitaBrl: number;
    hdi: number;
  };
  /** Mitigation-track inventory facts, for the mitigation tab. */
  inventory: {
    year: number;
    /** tCO2e by GPC sector name (matches `SECTORS[].name`). */
    bySector: Record<string, number>;
  };
}

// ─── Adaptation actions ──────────────────────────────────────────────────────

export type ActionSource = "c40" | "icare" | "ipcc";
export type Timeline = "<5 years" | "5-10 years" | ">10 years";
export type CostBand = "low" | "medium" | "high";
export type PreparationComplexity = "low" | "medium" | "high";
export type Effectiveness = "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";
export type Directness = "direct" | "indirect" | "out_of_scope";

/** How an action attaches to one component of one risk cell. */
export interface RiskLink {
  cell: RiskCellKey;
  component: Exclude<RiskComponent, "hazard">;
  directness: Directness;
  effectiveness?: Effectiveness;
  confidence?: Confidence;
  maladaptation?: boolean;
  /** Why the link was classified as it was — shown in the drawer. */
  rationale: Localized;
}

export type CoBenefitKey =
  | "social_equity"
  | "public_health"
  | "housing"
  | "air_quality"
  | "water_quality"
  | "biodiversity"
  | "mobility"
  | "local_economy";

export type CoBenefitScore = -2 | -1 | 0 | 1 | 2;

export type RelationshipKind = "prerequisite" | "corequisite" | "synergistic";

export interface ActionRelationship {
  kind: RelationshipKind;
  actionId: string;
  /** One sentence on why the two actions belong together, shown on the card. */
  rationale: Localized;
}

/** I Care legal classification (methodology §5.1, Sep 2026 revision). */
export type NormAuthority = "total" | "partial" | "none";
export type NormCompetence = "exclusive" | "supplementary" | "concurrent";

export interface LegalNorm {
  name: string;
  code: string;
  authority: NormAuthority;
  competence: NormCompetence;
  url?: string;
  validation: Localized;
}

export interface LegalAssessment {
  /** Delivery Capacity Score, 1–5. */
  score: number;
  /** Municipal / Shared / National — the city's delivery role. */
  responsibleLevel: "municipal" | "shared" | "national";
  norms: LegalNorm[];
  /** True while the verdict is a pilot placeholder awaiting I Care review. */
  placeholder: boolean;
}

export type FundingPathwayKey =
  | "domestic_grant"
  | "domestic_credit"
  | "federal_transfer"
  | "mdb_borrowing"
  | "international_grant"
  | "civil_defence";

export interface ComparableProject {
  name: string;
  city: string;
  channel: Localized;
  instrument: Localized;
  amountBrl: number;
  stage: Localized;
}

export type PolicyMatch = "direct" | "partial" | "adjacent";
export type PolicyStrength =
  "operational" | "funded" | "targeted" | "committed" | "enabling" | "context";

export interface PolicyEvidence {
  document: string;
  documentTier: "national" | "sectoral";
  page: number;
  recordType: string;
  match: PolicyMatch;
  strength: PolicyStrength;
  explicit: boolean;
  confidence: Confidence;
  /** Authoritative text. */
  pt: string;
  /** Review aid. */
  en: string;
}

export interface PolicyAssessment {
  /** 0–100. */
  score: number;
  evidence: PolicyEvidence[];
}

export interface AdaptationAction {
  id: string;
  source: ActionSource;
  name: Localized;
  description: Localized;
  /** Primary AdaptaBrasil sector; multi-sector actions display only this one. */
  sector: AdaptaSector;
  kind: "direct" | "enabling";
  /** Set when the action addresses a hazard AdaptaBrasil does not cover. */
  uncoveredHazard?: UncoveredHazard;
  timeline: Timeline;
  costBand: CostBand;
  preparationComplexity: PreparationComplexity;
  /** Display-only tags I Care is still populating. */
  scale?: "regional" | "neighbourhood" | "streets" | "plot";
  aimStrategy?: "reactive" | "preventive" | "transformative";
  links: RiskLink[];
  coBenefits: Partial<Record<CoBenefitKey, CoBenefitScore>>;
  /** True when the co-benefit scores are still the raw AI pass. */
  coBenefitsAiOnly: boolean;
  relationships: ActionRelationship[];
  legal: LegalAssessment;
  pathways: FundingPathwayKey[];
  comparableProjects: ComparableProject[];
  policy: PolicyAssessment;
  /** Which values above are pilot placeholders, for the provenance markers. */
  provenance: {
    linksReviewed: boolean;
    legalReviewed: boolean;
    policyReviewed: boolean;
  };
}

// ─── Mitigation (Brazil pattern: shifts → interventions) ─────────────────────

export interface MitigationIntervention {
  id: string;
  name: Localized;
  description: Localized;
  timeline: Timeline;
  costBand: CostBand;
  /** Fixed pillar scores; the mitigation model is not part of this demo. */
  impact: number;
  feasibility: number;
  alignment: number;
  coBenefits: Partial<Record<CoBenefitKey, CoBenefitScore>>;
}

export interface MitigationShift {
  id: string;
  name: Localized;
  description: Localized;
  /** GPC sector tag (`stationary_energy`, `transportation`, …). */
  sectorTag: string;
  /** Ordinal band the shift is ranked on. */
  reductionBand: "very_low" | "low" | "medium" | "high" | "very_high";
  impact: number;
  alignment: number;
  interventions: MitigationIntervention[];
}

// ─── City inputs (demo-local state) ──────────────────────────────────────────

export interface DemoWeights {
  impact: number;
  alignment: number;
  feasibility: number;
}

export interface DemoPreferences {
  /** AdaptaBrasil sectors (adaptation) or GPC sectors (mitigation). */
  sectors: string[];
  coBenefits: CoBenefitKey[];
  timeline: Timeline[];
  /** Adaptation only; the reweighting lever is still pending with AdaptaCidades. */
  priorityRisks: RiskCellKey[];
  excludedActionIds: string[];
  weights: DemoWeights;
}

export interface DemoTrackState {
  preferences: DemoPreferences;
  /** Set once the user has "run" the ranking on the processing screen. */
  generatedAt: string | null;
  /** Visited wizard steps, for the stepper and pre-flight list. */
  visited: { preferences?: boolean; preflight?: boolean };
}
