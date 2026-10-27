import type { CoarseFileKind } from "./coarse-kind";

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
] as const;
export type IngestErrorCode = (typeof INGEST_ERROR_CODES)[number];

export type IngestApprovalPolicy = "auto" | "review" | "reject";

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
