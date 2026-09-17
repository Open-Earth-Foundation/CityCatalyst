import { db } from "@/models";
import { BulkInventoryImportJob } from "@/models/BulkInventoryImportJob";
import { BulkInventoryImportItem } from "@/models/BulkInventoryImportItem";
import {
  BulkInventoryImportItemStatus,
  BulkInventoryImportJobStatus,
} from "@/util/enums";

export interface BulkInventoryImportItemCounts {
  total: number;
  pending: number;
  matched: number;
  unmatched: number;
  importing: number;
  completed: number;
  failed: number;
  skipped: number;
}

const EMPTY_COUNTS: BulkInventoryImportItemCounts = {
  total: 0,
  pending: 0,
  matched: 0,
  unmatched: 0,
  importing: 0,
  completed: 0,
  failed: 0,
  skipped: 0,
};

export function rollupItemCounts(
  items: Array<{ status: string }>,
): BulkInventoryImportItemCounts {
  const counts = { ...EMPTY_COUNTS, total: items.length };
  for (const item of items) {
    if (item.status in counts) {
      counts[item.status as keyof BulkInventoryImportItemCounts] += 1;
    }
  }
  return counts;
}

export function serializeJob(
  job: BulkInventoryImportJob,
  counts?: BulkInventoryImportItemCounts,
) {
  return {
    id: job.id,
    projectId: job.projectId,
    year: job.year,
    userId: job.userId ?? null,
    status: job.status,
    s3Key: job.s3Key ?? null,
    dryRun: job.dryRun,
    createMissingCities: job.createMissingCities,
    inventoryType: job.inventoryType,
    globalWarmingPotentialType: job.globalWarmingPotentialType,
    replaceExisting: job.replaceExisting,
    counts: counts ?? {
      total: job.totalCount,
      pending: 0,
      matched: job.matchedCount,
      unmatched: 0,
      importing: 0,
      completed: job.importedCount,
      failed: job.failedCount,
      skipped: job.skippedCount,
    },
    created: job.created?.toISOString() ?? null,
    lastUpdated: job.lastUpdated?.toISOString() ?? null,
  };
}

export function serializeItem(item: BulkInventoryImportItem) {
  return {
    id: item.id,
    jobId: item.jobId,
    originalFileName: item.originalFileName,
    s3Key: item.s3Key ?? null,
    cityId: item.cityId ?? null,
    inventoryId: item.inventoryId ?? null,
    locode: item.locode ?? null,
    importedFileId: item.importedFileId ?? null,
    resolvedYear: item.resolvedYear ?? null,
    status: item.status,
    errorCode: item.errorCode ?? null,
    errorLog: item.errorLog ?? null,
    warnings: item.warnings ?? [],
    created: item.created?.toISOString() ?? null,
    lastUpdated: item.lastUpdated?.toISOString() ?? null,
  };
}

export class BulkInventoryImportJobService {
  static async getLatestJobForProject(
    projectId: string,
  ): Promise<BulkInventoryImportJob | null> {
    return db.models.BulkInventoryImportJob.findOne({
      where: { projectId },
      order: [["created", "DESC"]],
    });
  }

  static async getJobById(
    jobId: string,
  ): Promise<BulkInventoryImportJob | null> {
    return db.models.BulkInventoryImportJob.findByPk(jobId);
  }

  static async listItems(
    jobId: string,
    status?: BulkInventoryImportItemStatus,
  ): Promise<BulkInventoryImportItem[]> {
    return db.models.BulkInventoryImportItem.findAll({
      where: status ? { jobId, status } : { jobId },
      order: [["originalFileName", "ASC"]],
    });
  }

  static async getJobWithRollup(jobId: string): Promise<{
    job: BulkInventoryImportJob;
    counts: BulkInventoryImportItemCounts;
    items: BulkInventoryImportItem[];
  } | null> {
    const job = await this.getJobById(jobId);
    if (!job) return null;
    const items = await this.listItems(jobId);
    return { job, items, counts: rollupItemCounts(items) };
  }

  static async getLatestJobWithRollup(projectId: string): Promise<{
    job: BulkInventoryImportJob;
    counts: BulkInventoryImportItemCounts;
  } | null> {
    const job = await this.getLatestJobForProject(projectId);
    if (!job) return null;
    const items = await this.listItems(job.id);
    return { job, counts: rollupItemCounts(items) };
  }

  static async refreshJobCounts(jobId: string): Promise<void> {
    const items = await this.listItems(jobId);
    const counts = rollupItemCounts(items);
    const pendingLeft = counts.pending + counts.importing;
    let status = BulkInventoryImportJobStatus.IMPORTING;
    if (pendingLeft === 0) {
      status =
        counts.completed > 0 || counts.skipped > 0
          ? BulkInventoryImportJobStatus.COMPLETED
          : BulkInventoryImportJobStatus.FAILED;
    }
    await db.models.BulkInventoryImportJob.update(
      {
        totalCount: counts.total,
        matchedCount: counts.matched + counts.pending,
        importedCount: counts.completed,
        failedCount: counts.failed,
        skippedCount: counts.skipped,
        status,
      },
      { where: { id: jobId } },
    );
  }
}

export { BulkInventoryImportJobStatus, BulkInventoryImportItemStatus };
