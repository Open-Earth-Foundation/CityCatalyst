import { Op, QueryTypes } from "sequelize";
import { db } from "@/models";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import {
  BulkInventoryImportAutoImportError,
  InventoryFileAutoImportService,
} from "@/backend/InventoryFileAutoImportService";
import { BulkInventoryImportJobService } from "@/backend/BulkInventoryImportJobService";
import { logger } from "@/services/logger";
import {
  BulkInventoryImportItemStatus,
  BulkInventoryImportJobStatus,
  BulkInventoryImportStage,
} from "@/util/enums";
import type { BulkInventoryImportItem } from "@/models/BulkInventoryImportItem";
import type { BulkInventoryImportJob } from "@/models/BulkInventoryImportJob";

/** Small enough that one cron tick cannot stall the app on a Chile-sized zip. */
export const BULK_INVENTORY_IMPORT_WORKER_BATCH_SIZE = 8;

export interface BulkInventoryImportWorkerResult {
  jobsTouched: number;
  itemsProcessed: number;
  itemsCompleted: number;
  itemsFailed: number;
  itemsSkipped: number;
}

async function resolveItemBuffer(
  item: BulkInventoryImportItem,
): Promise<Buffer | null> {
  if (item.s3Key) {
    try {
      return await InventoryFileStorageService.getFileBuffer(item.s3Key);
    } catch (err) {
      logger.error(
        { err, itemId: item.id, s3Key: item.s3Key },
        "Failed to load bulk import item from S3",
      );
      return null;
    }
  }
  if (item.data) {
    return Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data);
  }
  return null;
}

async function failItem(
  item: BulkInventoryImportItem,
  code: string,
  message: string,
): Promise<void> {
  await item.update({
    status: BulkInventoryImportItemStatus.FAILED,
    stage: null,
    errorCode: code,
    errorLog: message,
    lastUpdated: new Date(),
  });
}

async function setItemStage(
  item: BulkInventoryImportItem,
  stage: string | null,
): Promise<void> {
  await item.update({
    stage,
    lastUpdated: new Date(),
  });
}

async function processItem(
  item: BulkInventoryImportItem,
  job: BulkInventoryImportJob,
): Promise<"completed" | "failed" | "skipped"> {
  // Status is already IMPORTING from claimPendingItems (atomic claim).

  if (!job.userId) {
    await failItem(item, "missing_inventory", "Job has no user");
    return "failed";
  }
  if (!job.dryRun && (!item.cityId || !item.inventoryId)) {
    await failItem(
      item,
      "missing_inventory",
      "Item is not matched to a city, inventory, and job user",
    );
    return "failed";
  }

  await setItemStage(item, BulkInventoryImportStage.VALIDATING_FILE);

  const buffer = await resolveItemBuffer(item);
  if (!buffer) {
    await failItem(
      item,
      "missing_file",
      "Inner file bytes were not stored (S3 key and local data are both empty)",
    );
    return "failed";
  }

  try {
    const shouldReplace = Boolean(job.replaceExisting);
    if (shouldReplace) {
      await setItemStage(item, BulkInventoryImportStage.REPLACING_EXISTING);
    }
    await setItemStage(item, BulkInventoryImportStage.IMPORTING_EMISSIONS);

    const result = await InventoryFileAutoImportService.importFile({
      buffer,
      originalFileName: item.originalFileName,
      cityId: item.cityId ?? undefined,
      inventoryId: item.inventoryId ?? undefined,
      userId: job.userId,
      replaceExisting: shouldReplace,
      dryRun: job.dryRun,
    });

    if (
      result.warnings.includes("already_imported") &&
      result.importedRows === 0 &&
      result.importedFileId
    ) {
      await item.update({
        status: BulkInventoryImportItemStatus.SKIPPED,
        stage: null,
        errorCode: "already_imported",
        errorLog: "Same content digest already completed for this inventory",
        importedFileId: result.importedFileId,
        warnings: result.warnings,
        lastUpdated: new Date(),
      });
      return "skipped";
    }

    if (result.dryRun) {
      await item.update({
        status: BulkInventoryImportItemStatus.SKIPPED,
        stage: null,
        errorCode: "dry_run",
        errorLog:
          "Dry-run: file validated and matched; activities were not written",
        warnings: result.warnings,
        lastUpdated: new Date(),
      });
      return "skipped";
    }

    await item.update({
      status: BulkInventoryImportItemStatus.COMPLETED,
      stage: null,
      importedFileId: result.importedFileId,
      warnings: result.warnings.length ? result.warnings : item.warnings,
      errorCode: null,
      errorLog: null,
      lastUpdated: new Date(),
    });
    return "completed";
  } catch (err) {
    if (err instanceof BulkInventoryImportAutoImportError) {
      await failItem(item, err.code, err.message);
      return "failed";
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, itemId: item.id }, "Bulk inventory import item failed");
    await failItem(item, "import_failed", message);
    return "failed";
  }
}

export class BulkInventoryImportWorkerService {
  /**
   * Atomically claim the next pending items for this worker.
   * SELECT … FOR UPDATE SKIP LOCKED + status flip to importing prevents
   * cron and post-enqueue workers from importing the same file twice.
   */
  static async claimPendingItems(
    batchSize = BULK_INVENTORY_IMPORT_WORKER_BATCH_SIZE,
    jobId?: string,
  ): Promise<BulkInventoryImportItem[]> {
    if (!db.sequelize) {
      throw new Error("Database not initialized");
    }

    return db.sequelize.transaction(async (transaction) => {
      const locked = await db.sequelize!.query<{ id: string }>(
        `
        SELECT id
        FROM "BulkInventoryImportItem"
        WHERE status = :pending
          ${jobId ? "AND job_id = :jobId" : ""}
        ORDER BY created ASC
        LIMIT :batchSize
        FOR UPDATE SKIP LOCKED
        `,
        {
          replacements: {
            pending: BulkInventoryImportItemStatus.PENDING,
            batchSize,
            ...(jobId ? { jobId } : {}),
          },
          type: QueryTypes.SELECT,
          transaction,
        },
      );

      if (locked.length === 0) {
        return [];
      }

      const ids = locked.map((row) => row.id);
      const now = new Date();
      await db.models.BulkInventoryImportItem.update(
        {
          status: BulkInventoryImportItemStatus.IMPORTING,
          lastUpdated: now,
        },
        {
          where: { id: { [Op.in]: ids } },
          transaction,
        },
      );

      return db.models.BulkInventoryImportItem.findAll({
        where: { id: { [Op.in]: ids } },
        include: [{ model: db.models.BulkInventoryImportJob, as: "job" }],
        order: [["created", "ASC"]],
        transaction,
      });
    });
  }

  static async processDueJobs(
    batchSize = BULK_INVENTORY_IMPORT_WORKER_BATCH_SIZE,
    jobId?: string,
    options?: { maxBatches?: number },
  ): Promise<BulkInventoryImportWorkerResult> {
    // Cron (no jobId): one batch per tick so the request stays short.
    // Post-enqueue (jobId set): drain that job so local `next dev` (no cron)
    // and small zips finish without a manual cron poke.
    const maxBatches =
      options?.maxBatches ?? (jobId ? 64 : 1);

    const result: BulkInventoryImportWorkerResult = {
      jobsTouched: 0,
      itemsProcessed: 0,
      itemsCompleted: 0,
      itemsFailed: 0,
      itemsSkipped: 0,
    };
    const touchedJobs = new Set<string>();

    for (let batch = 0; batch < maxBatches; batch += 1) {
      const batchResult = await this.processOneBatch(batchSize, jobId);
      if (batchResult.itemsProcessed === 0) {
        break;
      }
      result.itemsProcessed += batchResult.itemsProcessed;
      result.itemsCompleted += batchResult.itemsCompleted;
      result.itemsFailed += batchResult.itemsFailed;
      result.itemsSkipped += batchResult.itemsSkipped;
      for (const id of batchResult.jobIds) {
        touchedJobs.add(id);
      }
    }

    result.jobsTouched = touchedJobs.size;
    if (result.itemsProcessed > 0) {
      logger.info(result, "Processed bulk inventory import batch(es)");
    }
    return result;
  }

  private static async processOneBatch(
    batchSize: number,
    jobId?: string,
  ): Promise<
    BulkInventoryImportWorkerResult & { jobIds: string[] }
  > {
    const result: BulkInventoryImportWorkerResult & { jobIds: string[] } = {
      jobsTouched: 0,
      itemsProcessed: 0,
      itemsCompleted: 0,
      itemsFailed: 0,
      itemsSkipped: 0,
      jobIds: [],
    };

    const items = await this.claimPendingItems(batchSize, jobId);

    if (items.length === 0) {
      return result;
    }

    const jobIds = [...new Set(items.map((item) => item.jobId))];
    result.jobIds = jobIds;
    result.jobsTouched = jobIds.length;
    await db.models.BulkInventoryImportJob.update(
      {
        status: BulkInventoryImportJobStatus.IMPORTING,
        progressStage: BulkInventoryImportStage.IMPORTING_FILES,
      },
      { where: { id: { [Op.in]: jobIds } } },
    );

    for (const item of items) {
      const job = item.job;
      if (!job) {
        await failItem(item, "missing_job", "Parent job was not found");
        result.itemsProcessed += 1;
        result.itemsFailed += 1;
        continue;
      }
      const outcome = await processItem(item, job);
      result.itemsProcessed += 1;
      if (outcome === "completed") result.itemsCompleted += 1;
      if (outcome === "failed") result.itemsFailed += 1;
      if (outcome === "skipped") result.itemsSkipped += 1;
    }

    for (const id of jobIds) {
      await BulkInventoryImportJobService.refreshJobCounts(id);
    }

    return result;
  }
}
