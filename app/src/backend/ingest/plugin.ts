import type { CoarseFileKind } from "./coarse-kind";
import type {
  IngestApprovalPolicy,
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
}
