import type { CoarseFileKind } from "./coarse-kind";
import type { IngestSourceReconciliationReport } from "./source-reconciliation";

export const INGEST_MODULES = ["test", "ghgi", "ccra", "cnb"] as const;
export type IngestModuleId = (typeof INGEST_MODULES)[number];

export const INGEST_VISIBILITIES = ["city", "run", "org", "project"] as const;
export type IngestVisibility = (typeof INGEST_VISIBILITIES)[number];

export const INGEST_JOB_STATUSES = [
  "pending",
  "running",
  "awaiting_review",
  "completed",
  "failed",
  "cancelled",
] as const;
export type IngestJobStatus = (typeof INGEST_JOB_STATUSES)[number];

export const INGEST_ITEM_STATUSES = [
  "pending",
  "running",
  "awaiting_review",
  "completed",
  "failed",
  "skipped",
] as const;
export type IngestItemStatus = (typeof INGEST_ITEM_STATUSES)[number];

/** Ordered stages Core runs. Plugins never skip Core's order. */
export const INGEST_STAGES = [
  "receive",
  "store",
  "match",
  "detect",
  "parse",
  "map",
  "adapt",
  "validate",
  "decide",
  "commit",
  "publish",
] as const;
export type IngestStage = (typeof INGEST_STAGES)[number];

export const INGEST_ERROR_CODES = [
  "unsupported_extension",
  "unknown_format",
  "empty_zip",
  "not_zip",
  "path_traversal",
  "too_many_files",
  "file_too_large",
  "zip_too_large",
  "validation_failed",
  "dry_run",
  "commit_failed",
  "missing_scope",
  "no_files",
  "stale_review_draft",
  "review_locked",
  "mapping_incomplete",
  "document_not_found",
  "document_withdrawn",
  "document_superseded",
  "document_unavailable",
  "ambiguous_imported_data",
  "reconciliation_failed",
] as const;
export type IngestErrorCode = (typeof INGEST_ERROR_CODES)[number];

export type IngestApprovalPolicy = "auto" | "review" | "reject";

export interface IngestColumnMappingInput {
  sourceColumns: string[];
  sampleValues: Record<string, string[]>;
  taxonomyFields: string[];
  requiredFields: string[];
  /** Optional model or plugin suggestions. Cannot commit. */
  suggested?: Record<string, string | null>;
}

export interface IngestColumnMappingEntry {
  sourceColumn: string;
  taxonomyField: string | null;
  sampleValues: string[];
  suggestedBy?: "model" | "heuristic" | null;
}

export interface IngestColumnMappingProposal {
  taxonomyFields: string[];
  requiredFields: string[];
  columns: IngestColumnMappingEntry[];
}

export interface IngestConfirmedColumnMap {
  mappings: Array<{ sourceColumn: string; taxonomyField: string }>;
}

export interface IngestColumnMappingState {
  status: "pending" | "confirmed";
  proposal: IngestColumnMappingProposal;
  confirmed: IngestConfirmedColumnMap | null;
}

export type IngestReviewDecisionStatus = "pending" | "confirmed" | "rejected";

export interface IngestReviewTargetBinding {
  cityId?: string | null;
  inventoryId?: string | null;
}

export interface IngestReviewDecision {
  status: IngestReviewDecisionStatus;
  userId?: string | null;
  at?: string | null;
}

/**
 * Core-owned envelope. `payload` is the plugin DTO and is opaque to Core.
 */
export interface IngestReviewDraftEnvelope {
  version: number;
  bundleDigest: string;
  sourceContentHash: string;
  targetBinding: IngestReviewTargetBinding;
  expiresAt: string;
  decision: IngestReviewDecision;
  payload: unknown;
  /** Core-owned mapping stage. Absent when the plugin skipped mapping. */
  columnMapping?: IngestColumnMappingState | null;
  reconciliation?: IngestSourceReconciliationReport | null;
}

export interface IngestScope {
  organizationId?: string | null;
  projectId?: string | null;
  cityId?: string | null;
  inventoryId?: string | null;
  runId?: string | null;
}

export interface IngestFileInput {
  name: string;
  buffer: Buffer;
}

export interface IngestJobRecord {
  id: string;
  moduleId: IngestModuleId;
  status: IngestJobStatus;
  dryRun: boolean;
  visibility: IngestVisibility;
  organizationId?: string | null;
  projectId?: string | null;
  cityId?: string | null;
  uploadedByUserId?: string | null;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  awaitingReviewCount: number;
  errorCode?: string | null;
  errorLog?: string | null;
}

export interface IngestItemRecord {
  id: string;
  jobId: string;
  originalFileName: string;
  contentHash?: string | null;
  status: IngestItemStatus;
  stage?: IngestStage | null;
  errorCode?: string | null;
  errorLog?: string | null;
  warnings: string[];
  targetCityId?: string | null;
  targetInventoryId?: string | null;
  coverageYears: number[];
  result?: Record<string, unknown> | null;
  buffer?: Buffer | null;
  /** Set by Core at coarse detect (stage 4a). */
  coarseKind?: CoarseFileKind | null;
  /** Document-pool id after a non-dry-run store (CC-955). */
  documentId?: string | null;
  /** Core-owned review envelope. Plugin DTO is `reviewDraft.payload`. */
  reviewDraft?: IngestReviewDraftEnvelope | null;
  reviewDraftVersion?: number | null;
  reviewLockedByUserId?: string | null;
  reviewLockedAt?: Date | null;
}

export class IngestItemError extends Error {
  constructor(
    readonly code: IngestErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "IngestItemError";
  }
}

export function ingestItemErrorStatus(
  error: IngestItemError,
): 400 | 404 | 409 {
  if (error.code === "document_not_found") {
    return 404;
  }
  if (
    error.code === "stale_review_draft" ||
    error.code === "review_locked" ||
    error.code === "mapping_incomplete" ||
    error.code === "document_withdrawn" ||
    error.code === "document_superseded" ||
    error.code === "document_unavailable" ||
    error.code === "ambiguous_imported_data"
  ) {
    return 409;
  }
  return 400;
}
