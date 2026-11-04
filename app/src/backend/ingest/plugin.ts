import type { CoarseFileKind } from "./coarse-kind";
import type { IngestSourceReconciliationInput } from "./source-reconciliation";
import type {
  IngestApprovalPolicy,
  IngestColumnMappingInput,
  IngestItemRecord,
  IngestJobRecord,
  IngestModuleId,
  IngestScope,
} from "./types";

export interface IngestMatchResult {
  targetCityId?: string | null;
  targetInventoryId?: string | null;
  coverageYears?: number[];
  warnings?: string[];
}

export interface IngestPluginContext {
  job: IngestJobRecord;
  item: IngestItemRecord;
  scope: IngestScope;
}

/**
 * Module-owned steps. Core never reads domain columns; it only sequences
 * these hooks and records status.
 */
export interface IngestPlugin {
  readonly moduleId: IngestModuleId;
  readonly allowedExtensions: readonly string[];

  /** Format-specific detect (eCRF, near-eCRF, …). Core already set coarse. */
  detect(
    ctx: IngestPluginContext,
    coarse: CoarseFileKind,
  ): Promise<void> | void;
  parse(ctx: IngestPluginContext): Promise<unknown>;
  /**
   * Ask Core to run the shared mapping stage. Omit or return void to skip
   * (known formats). Suggestions may come from a model; they cannot commit.
   */
  columnMapping?(
    ctx: IngestPluginContext,
    parsed: unknown,
  ):
    | Promise<IngestColumnMappingInput | void>
    | IngestColumnMappingInput
    | void;
  adapt(ctx: IngestPluginContext, parsed: unknown): Promise<unknown>;
  validate(
    ctx: IngestPluginContext,
    adapted: unknown,
  ): Promise<{ warnings?: string[] } | void>;
  approvalPolicy(
    ctx: IngestPluginContext,
    adapted: unknown,
  ): IngestApprovalPolicy;
  /**
   * Write the module system of record. Test plugins must no-op or only
   * return a result pointer — never GHGI/CCRA/CNB rows.
   */
  commit(
    ctx: IngestPluginContext,
    adapted: unknown,
  ): Promise<Record<string, unknown> | void>;
  reviewSummary?(
    ctx: IngestPluginContext,
    adapted: unknown,
  ): Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
  match?(
    ctx: IngestPluginContext,
  ):
    | Promise<IngestMatchResult | void>
    | IngestMatchResult
    | void;
  /**
   * Opaque review DTO. Core stores it and never reads domain columns.
   * Default is a JSON clone of `adapted`.
   */
  serializeReviewDraft?(
    adapted: unknown,
    validation?: { warnings?: string[] } | void,
  ): unknown;
  /** Rebuild the canonical bundle Core will pass to commit. */
  hydrateReviewDraft?(draft: unknown): unknown;
  /**
   * How adapted values point back at the source file. Core checks occupancy
   * and row accounting; it does not read domain columns.
   */
  sourceReconciliation?(
    ctx: IngestPluginContext,
    adapted: unknown,
  ):
    | Promise<IngestSourceReconciliationInput | void>
    | IngestSourceReconciliationInput
    | void;
}
