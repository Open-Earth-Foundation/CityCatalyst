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

export interface MeedPrioritizeCityResult {
  locode: string;
  ranked_action_ids?: string[];
  ranked_actions?: MeedRankedActionResult[];
  metadata?: Record<string, unknown>;
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
