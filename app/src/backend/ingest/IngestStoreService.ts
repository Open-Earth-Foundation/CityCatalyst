import { db } from "@/models";
import type { IngestItem } from "@/models/IngestItem";
import type { IngestJob } from "@/models/IngestJob";
import type {
  CreateIngestItemInput,
  CreateIngestJobInput,
  IngestStore,
} from "./store";
import { parseReviewDraft } from "./review-draft";
import type {
  IngestItemRecord,
  IngestJobRecord,
  IngestModuleId,
  IngestVisibility,
} from "./types";

function toBuffer(
  data: Buffer | Uint8Array | null | undefined,
): Buffer | null {
  if (!data) return null;
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

function toJobRecord(row: IngestJob): IngestJobRecord {
  return {
    id: row.id,
    moduleId: row.moduleId as IngestModuleId,
    status: row.status,
    dryRun: row.dryRun,
    visibility: row.visibility as IngestVisibility,
    organizationId: row.organizationId,
    projectId: row.projectId,
    cityId: row.cityId,
    uploadedByUserId: row.uploadedByUserId,
    totalCount: row.totalCount,
    completedCount: row.completedCount,
    failedCount: row.failedCount,
    skippedCount: row.skippedCount,
    awaitingReviewCount: row.awaitingReviewCount,
    errorCode: row.errorCode,
    errorLog: row.errorLog,
  };
}

function toItemRecord(row: IngestItem): IngestItemRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    originalFileName: row.originalFileName,
    contentHash: row.contentHash,
    status: row.status,
    stage: row.stage,
    errorCode: row.errorCode,
    errorLog: row.errorLog,
    warnings: row.warnings ?? [],
    targetCityId: row.targetCityId,
    targetInventoryId: row.targetInventoryId,
    coverageYears: row.coverageYears ?? [],
    result: row.result,
    buffer: toBuffer(row.data),
    documentId: row.documentId,
    reviewDraft: parseReviewDraft(row.reviewDraft),
    reviewDraftVersion: row.reviewDraftVersion ?? 0,
    reviewLockedByUserId: row.reviewLockedByUserId,
    reviewLockedAt: row.reviewLockedAt,
  };
}

/**
 * Postgres-backed job/item store. Review drafts live on IngestItem.review_draft.
 */
export class SequelizeIngestStore implements IngestStore {
  async createJob(input: CreateIngestJobInput): Promise<IngestJobRecord> {
    const row = await db.models.IngestJob.create({
      id: input.id,
      moduleId: input.moduleId,
      dryRun: input.dryRun,
      visibility: input.visibility,
      organizationId: input.organizationId,
      projectId: input.projectId,
      cityId: input.cityId,
      uploadedByUserId: input.uploadedByUserId,
    });
    return toJobRecord(row);
  }

  async getJob(jobId: string): Promise<IngestJobRecord | null> {
    const row = await db.models.IngestJob.findByPk(jobId);
    return row ? toJobRecord(row) : null;
  }

  async updateJob(
    jobId: string,
    patch: Partial<IngestJobRecord>,
  ): Promise<IngestJobRecord> {
    const row = await db.models.IngestJob.findByPk(jobId);
    if (!row) {
      throw new Error(`Ingest job ${jobId} not found`);
    }
    await row.update(patch);
    return toJobRecord(row);
  }

  async createItem(input: CreateIngestItemInput): Promise<IngestItemRecord> {
    const row = await db.models.IngestItem.create({
      id: input.id,
      jobId: input.jobId,
      originalFileName: input.originalFileName,
      contentHash: input.contentHash,
      targetCityId: input.targetCityId,
      targetInventoryId: input.targetInventoryId,
      coverageYears: input.coverageYears ?? [],
      warnings: input.warnings ?? [],
      data: input.buffer,
      documentId: input.documentId,
      reviewDraft: input.reviewDraft as Record<string, unknown> | undefined,
      reviewDraftVersion: input.reviewDraftVersion,
      reviewLockedByUserId: input.reviewLockedByUserId,
      reviewLockedAt: input.reviewLockedAt,
    });
    return toItemRecord(row);
  }

  async getItem(itemId: string): Promise<IngestItemRecord | null> {
    const row = await db.models.IngestItem.findByPk(itemId);
    return row ? toItemRecord(row) : null;
  }

  async listItems(jobId: string): Promise<IngestItemRecord[]> {
    const rows = await db.models.IngestItem.findAll({ where: { jobId } });
    return rows.map(toItemRecord);
  }

  async updateItem(
    itemId: string,
    patch: Partial<IngestItemRecord>,
  ): Promise<IngestItemRecord> {
    const row = await db.models.IngestItem.findByPk(itemId);
    if (!row) {
      throw new Error(`Ingest item ${itemId} not found`);
    }
    const { buffer, reviewDraft, coarseKind: _coarseKind, ...rest } = patch;
    await row.update({
      ...rest,
      ...(buffer !== undefined ? { data: buffer } : {}),
      ...(reviewDraft !== undefined
        ? { reviewDraft: reviewDraft as Record<string, unknown> | null }
        : {}),
    });
    return toItemRecord(row);
  }
}
