import { isColumnMappingPending } from "./column-mapping";
import { IngestRunner } from "./IngestRunner";
import { createIngestPlugin } from "./registry";
import type { IngestPlugin } from "./plugin";
import type { IngestStore } from "./store";
import {
  IngestItemError,
  type IngestColumnMappingState,
  type IngestFileInput,
  type IngestItemRecord,
  type IngestJobRecord,
  type IngestModuleId,
  type IngestReviewTargetBinding,
  type IngestScope,
} from "./types";

export const INGEST_START_CAPABILITY = "ingest.start" as const;
export const INGEST_STATUS_CAPABILITY = "ingest.status" as const;
export const INGEST_CONFIRM_CAPABILITY = "ingest.confirm" as const;

export interface IngestAgentStartInput {
  moduleId: IngestModuleId;
  scope: IngestScope;
  userId: string;
  dryRun?: boolean;
  files?: IngestFileInput[];
  documentId?: string;
  plugin?: IngestPlugin;
}

export interface IngestAgentConfirmInput {
  itemId: string;
  userId: string;
  reviewDraftVersion: number;
  targetBinding?: IngestReviewTargetBinding;
  mappings?: Array<{ sourceColumn: string; taxonomyField: string }>;
  plugin?: IngestPlugin;
}

export interface IngestAgentItemView {
  id: string;
  jobId: string;
  originalFileName: string;
  status: IngestItemRecord["status"];
  stage: IngestItemRecord["stage"];
  warnings: string[];
  errorCode: string | null;
  errorLog: string | null;
  result: Record<string, unknown> | null;
  reviewDraftVersion: number | null;
  reviewSummary: unknown;
  issues: string[];
  columnMapping: IngestColumnMappingState | null;
  documentId: string | null;
}

export interface IngestAgentStatusView {
  capability: typeof INGEST_STATUS_CAPABILITY;
  job: {
    id: string;
    moduleId: IngestModuleId;
    status: IngestJobRecord["status"];
    dryRun: boolean;
    totalCount: number;
    completedCount: number;
    failedCount: number;
    skippedCount: number;
    awaitingReviewCount: number;
  };
  items: IngestAgentItemView[];
}

/**
 * Agent path onto the shared runner. Confirm is the only agent commit.
 * Auto formats still commit inside `run`. Views never include buffers or S3 keys.
 */
export class IngestAgent {
  constructor(
    private readonly runner: IngestRunner,
    private readonly store: IngestStore,
  ) {}

  async start(input: IngestAgentStartInput): Promise<IngestAgentStatusView> {
    const plugin = input.plugin ?? createIngestPlugin(input.moduleId);
    const job = input.documentId
      ? await this.runner.enqueueFromDocument({
          moduleId: input.moduleId,
          documentId: input.documentId,
          dryRun: input.dryRun,
          uploadedByUserId: input.userId,
          scope: input.scope,
        })
      : await this.runner.enqueue({
          moduleId: input.moduleId,
          files: input.files ?? [],
          dryRun: input.dryRun,
          uploadedByUserId: input.userId,
          scope: input.scope,
        });
    const finished = await this.runner.run(job.id, plugin);
    return this.status(finished.id);
  }

  async status(jobId: string): Promise<IngestAgentStatusView> {
    const job = await this.store.getJob(jobId);
    if (!job) {
      throw new IngestItemError("commit_failed", `Ingest job ${jobId} not found`);
    }
    const items = await this.store.listItems(jobId);
    return {
      capability: INGEST_STATUS_CAPABILITY,
      job: {
        id: job.id,
        moduleId: job.moduleId,
        status: job.status,
        dryRun: job.dryRun,
        totalCount: job.totalCount,
        completedCount: job.completedCount,
        failedCount: job.failedCount,
        skippedCount: job.skippedCount,
        awaitingReviewCount: job.awaitingReviewCount,
      },
      items: items.map(toAgentItemView),
    };
  }

  async confirm(
    input: IngestAgentConfirmInput,
  ): Promise<IngestAgentStatusView> {
    const item = await this.store.getItem(input.itemId);
    if (!item) {
      throw new IngestItemError("commit_failed", "Ingest item not found");
    }
    const job = await this.store.getJob(item.jobId);
    if (!job) {
      throw new IngestItemError("commit_failed", "Ingest job not found");
    }
    const plugin = input.plugin ?? createIngestPlugin(job.moduleId);
    if (isColumnMappingPending(item.reviewDraft?.columnMapping)) {
      if (!input.mappings?.length) {
        throw new IngestItemError(
          "mapping_incomplete",
          "Confirm the column map before committing",
        );
      }
      await this.runner.confirmColumnMapping(item.id, plugin, {
        userId: input.userId,
        reviewDraftVersion: input.reviewDraftVersion,
        mappings: input.mappings,
      });
    } else {
      await this.runner.confirmReview(item.id, plugin, {
        userId: input.userId,
        reviewDraftVersion: input.reviewDraftVersion,
        targetBinding: input.targetBinding,
      });
    }
    return this.status(job.id);
  }
}

function toAgentItemView(item: IngestItemRecord): IngestAgentItemView {
  const draft = item.reviewDraft ?? null;
  const issues = [
    ...item.warnings,
    ...(item.errorLog ? [item.errorLog] : []),
  ];
  return {
    id: item.id,
    jobId: item.jobId,
    originalFileName: item.originalFileName,
    status: item.status,
    stage: item.stage ?? null,
    warnings: item.warnings,
    errorCode: item.errorCode ?? null,
    errorLog: item.errorLog ?? null,
    result: item.result ?? null,
    reviewDraftVersion: item.reviewDraftVersion ?? draft?.version ?? null,
    reviewSummary: item.result?.review ?? draft?.payload ?? null,
    issues,
    columnMapping: draft?.columnMapping ?? null,
    documentId: item.documentId ?? null,
  };
}
