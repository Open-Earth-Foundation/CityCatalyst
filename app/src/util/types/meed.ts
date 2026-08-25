/**
 * MEED+ shared API contract.
 *
 * Request/response shapes for the four `hiap-meed` endpoints, extracted from the
 * prototype (`meed-mitigation-prioritizer-frontend`: `lib/hiapApi.ts`, `lib/reportApi.ts`).
 * This is the week-0 contract artifact from docs/MeedModuleMigration.md §5.7 — the
 * frontend builds against these types while the backend service layer is built.
 *
 * Endpoints (all POST, `{ meta, requestData }` envelope, built server-side):
 * - /v1/prioritize                       → PrioritizerApiCityResult[]
 * - /v1/prioritize/exclusions/preview    → ExclusionPreviewCityResult[]
 * - /v1/reports/output-plan              → ReportOutputPlanResponse (10–30 s LLM call; async job)
 * - /v1/explanations/translate           → ExplanationTranslationResult[]
 */

// ─── Request envelope ────────────────────────────────────────────────────────

export interface MeedApiContext {
  endpoint: string;
  locodes: string[];
}

export interface MeedRequestMeta {
  requestId: string;
  generatedAtUtc: string;
  backendConsumer: string;
  upstreamProvider: string;
  apiContext: MeedApiContext;
  totalRecords: number;
}

// ─── City emissions input (GPC-reference level) ──────────────────────────────

export interface GpcActivity {
  activityType?: string | null;
  totalEmissions?: number | null;
  totalEmissionsUnit?: string | null;
  activityValue?: number | null;
  activityUnit?: string | null;
  dataSource?: string | null;
  notationKey?: string | null;
}

export interface GpcDataEntry {
  notationKey?: string | null;
  activities: GpcActivity[];
}

export interface MeedCityEmissionsData {
  inventoryYear?: number | null;
  gpcData: Record<string, GpcDataEntry>;
}

export type MeedTimeframePreference =
  | "short"
  | "medium"
  | "long"
  | "no_preference";

export interface MeedCityInput {
  locode: string;
  countryCode: string;
  populationSize?: number | null;
  excludedActionIds?: string[];
  weightsOverride?: Record<string, number> | null;
  cityStrategicPreferenceSectors?: string[];
  cityStrategicPreferenceTimeframes?: MeedTimeframePreference[];
  cityStrategicPreferenceCoBenefitKeys?: string[];
  cityEmissionsData: MeedCityEmissionsData;
}

// ─── /v1/prioritize ──────────────────────────────────────────────────────────

export interface MeedPrioritizeRequestData {
  cityDataList: MeedCityInput[];
  createExplanations?: boolean;
  topN?: number | null;
  requestedLanguages?: string[];
}

export interface MeedRankedActionResult {
  action_id: string;
  rank: number;
  final_score: number;
  impact_score: number;
  alignment_score: number;
  feasibility_score: number;
  evidence_summary: Record<string, unknown>;
  explanations?: Record<string, string>;
}

/**
 * Legal evidence attached to an action removed by the legal hard filter.
 *
 * Note the deliberate asymmetry in which field carries which language:
 * `legal_justification` is the *native* text (Spanish for Chilean sources) with
 * `legal_justification_en` as the translation, while `ownership_description` and
 * `restrictions_description` are English with `_es` variants. Read them through
 * a helper rather than assuming a consistent convention.
 */
export interface MeedRemovedActionLegalEvidence {
  verdict_category?: string | null;
  verdict_score?: number | null;
  ownership_category?: string | null;
  ownership_score?: number | null;
  ownership_description?: string | null;
  ownership_description_es?: string | null;
  restrictions_category?: string | null;
  restrictions_score?: number | null;
  restrictions_description?: string | null;
  restrictions_description_es?: string | null;
  legal_justification?: string | null;
  legal_justification_en?: string | null;
  legal_references?: string[];
}

/** One action dropped before ranking. Shaped by the backend for display. */
export interface MeedRemovedActionSummary {
  action_id: string;
  action_name: string;
  removal_reason?: string | null;
  /** e.g. "legal_hard_filter" | "user_exclusion" | "hard_filter". */
  removal_source: string;
  legal?: MeedRemovedActionLegalEvidence | null;
}

/**
 * Per-action hard-filter evidence. Present for *every* action, not just the
 * discarded ones — actions that were kept but lack a legal assessment are only
 * discoverable here, since they never appear in `removed_actions`.
 */
export interface MeedHardFilterEvidence {
  discard_reason?: string | null;
  legal_assessment_present?: boolean | null;
  legal_verdict_category?: string | null;
  legal_assessment_summary?: Record<string, unknown> | null;
}

/** The pillar weights the backend actually scored with. */
export interface MeedPrioritizationWeights {
  impact: number;
  alignment: number;
  feasibility: number;
}

/**
 * Every field is optional: a top-N response can state how many actions it
 * ranked and how many it dropped, but not how many the catalog held or how
 * many survived the filter. Consumers already fall back when a count is
 * absent, which is a better answer than a confident wrong number.
 */
export interface MeedPrioritizationCounts {
  total_actions?: number;
  valid_actions?: number;
  discarded_excluded?: number;
  discarded_legal?: number;
  ranked_actions?: number;
}

/**
 * Prioritization metadata. Typed for the fields the UI reads; the index
 * signature keeps the rest, since the backend model allows extras.
 */
export interface MeedPrioritizationMetadata {
  locode?: string;
  internal_request_id?: string;
  frontend_request_id?: string | null;
  counts?: MeedPrioritizationCounts;
  weights?: MeedPrioritizationWeights;
  timings?: Record<string, number>;
  hard_filter_evidence_by_action_id?: Record<string, MeedHardFilterEvidence>;
  [key: string]: unknown;
}

export interface MeedPrioritizeCityResult {
  locode: string;
  ranked_action_ids?: string[];
  ranked_actions?: MeedRankedActionResult[];
  /** Actions dropped before ranking — the source for legal screening. */
  removed_actions?: MeedRemovedActionSummary[];
  metadata?: MeedPrioritizationMetadata;
  warnings?: string[];
}

// ─── /v1/prioritize/exclusions/preview ───────────────────────────────────────

export interface MeedExclusionPreviewCityInput {
  locode: string;
  excludedSectorTags?: string[];
  excludedCoBenefitKeys?: string[];
  excludedActionsFreeText?: string | null;
}

export interface MeedProposedExcludedAction {
  actionId: string;
  actionName: string;
  reasons: string[];
  matchedBy: string[];
}

export interface MeedExclusionSummaryReasonGroup {
  count: number;
  actionIds: string[];
}

export interface MeedExclusionSummary {
  totalProposed: number;
  byReasonType: Record<string, MeedExclusionSummaryReasonGroup>;
}

export interface MeedExclusionPreviewCityResult {
  locode: string;
  proposedExcludedActions: MeedProposedExcludedAction[];
  exclusionSummary: MeedExclusionSummary;
  warnings: string[];
}

// ─── /v1/explanations/translate ──────────────────────────────────────────────

export interface MeedExplanationTranslationActionInput {
  actionId: string;
  canonicalExplanation: string;
}

export interface MeedExplanationTranslationResult {
  actionId: string;
  explanations: Record<string, string>;
}

// ─── /v1/reports/output-plan ─────────────────────────────────────────────────

/**
 * Localized fields arrive as { en, es } maps ("json_chapters_markdown_i18n").
 * Older responses returned flat strings; resolvers must tolerate both.
 */
export type MeedI18nText = string | Record<string, string>;
export type MeedI18nList = string[] | Record<string, string[]>;

export interface MeedReportChapter {
  key: string;
  title: MeedI18nText;
  markdown: MeedI18nText;
  source_refs?: string[];
  limitations?: MeedI18nList;
}

export interface MeedReportOutputPlanResponse {
  locode: string;
  action_id: string;
  /** Languages the plan was generated in, in display order (e.g. ["en","es"]). */
  language: string | string[];
  format?: string;
  chapters: MeedReportChapter[];
  metadata: Record<string, unknown>;
}

/** The exact prioritize request/response pair a report is generated from. */
export interface MeedPrioritizationSnapshot {
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  storedAtUtc: string;
}

// ─── CityCatalyst ranking route ──────────────────────────────────────────────
//
// POST /api/v1/city/{cityId}/meed/rank   — runs the ranking and stores it
// GET  /api/v1/city/{cityId}/meed/rank?inventoryId={uuid}
//
// This is the only MEED boundary the frontend touches: the route owns the call
// to hiap-meed. Its model is camelCase, which is correct for CityCatalyst and
// deliberately unlike the snake_case prioritizer types above — the two are
// bridged in `MEED/meedRankingAdapter.ts` and nowhere else.

/** Multilingual field on the route's model, e.g. `{ en: "…", es: "…" }`. */
export type MeedRouteI18nText = Record<string, string | null | undefined>;

export interface MeedRankRouteRankedAction {
  actionId?: string;
  rank?: number;
  finalScore?: number;
  impactScore?: number;
  alignmentScore?: number;
  feasibilityScore?: number;
  explanations?: Record<string, string>;
  /** Already snake_case inside — see MeedRankedActionResult.evidence_summary. */
  evidenceSummary?: Record<string, unknown>;
  weights?: Partial<MeedPrioritizationWeights>;
}

export interface MeedRankRouteRemovedAction {
  actionId?: string;
  actionName?: string;
  removalReason?: string | null;
  removalSource?: string | null;
  verdictCategory?: string | null;
  ownershipCategory?: string | null;
  restrictionsCategory?: string | null;
  ownershipDescription?: MeedRouteI18nText | null;
  restrictionsDescription?: MeedRouteI18nText | null;
  legalJustification?: MeedRouteI18nText | null;
  legalReferences?: string[] | null;
}

/** The `data` payload both verbs return. */
export interface MeedRankRouteResponse {
  rankedActions?: MeedRankRouteRankedAction[];
  removedActions?: MeedRankRouteRemovedAction[];
}

/**
 * Per-city preferences for a ranking run.
 *
 * Locode, country code, population and emissions are deliberately absent: the
 * route builds all of them from the CityCatalyst database using `inventoryId`.
 * Do not add them here.
 */
export interface MeedRunRankingCityData {
  excludedActionIds: string[];
  /** `{}` means "use the backend defaults". Required by the route's schema. */
  weightsOverride: Record<string, number>;
  cityStrategicPreferenceSectors: string[];
  cityStrategicPreferenceTimeframes: MeedTimeframePreference[];
  cityStrategicPreferenceCoBenefitKeys: string[];
}

/**
 * POST body. `cityDataList` is an array even though one inventory means one
 * city — that is the upstream prioritizer's batch shape showing through.
 */
export interface MeedRunRankingRequest {
  inventoryId: string;
  requestedLanguages: string[];
  topN?: number;
  createExplanations?: boolean;
  cityDataList: MeedRunRankingCityData[];
}
