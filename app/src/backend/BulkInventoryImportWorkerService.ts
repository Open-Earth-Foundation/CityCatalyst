import { Op } from "sequelize";
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
    errorCode: code,
    errorLog: message,
    lastUpdated: new Date(),
  });
}

async function processItem(
  item: BulkInventoryImportItem,
  job: BulkInventoryImportJob,
): Promise<"completed" | "failed" | "skipped"> {
  await item.update({
    status: BulkInventoryImportItemStatus.IMPORTING,
    lastUpdated: new Date(),
  });

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
    const result = await InventoryFileAutoImportService.importFile({
      buffer,
      originalFileName: item.originalFileName,
      cityId: item.cityId ?? undefined,
      inventoryId: item.inventoryId ?? undefined,
      userId: job.userId,
      replaceExisting: job.replaceExisting,
      dryRun: job.dryRun,
    });

    if (
      result.warnings.includes("already_imported") &&
      result.importedRows === 0 &&
      result.importedFileId
    ) {
      await item.update({
        status: BulkInventoryImportItemStatus.SKIPPED,
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
  static async processDueJobs(
    batchSize = BULK_INVENTORY_IMPORT_WORKER_BATCH_SIZE,
    jobId?: string,
  ): Promise<BulkInventoryImportWorkerResult> {
    const result: BulkInventoryImportWorkerResult = {
      jobsTouched: 0,
      itemsProcessed: 0,
      itemsCompleted: 0,
      itemsFailed: 0,
      itemsSkipped: 0,
    };

    const items = await db.models.BulkInventoryImportItem.findAll({
      where: jobId
        ? { status: BulkInventoryImportItemStatus.PENDING, jobId }
        : { status: BulkInventoryImportItemStatus.PENDING },
      include: [{ model: db.models.BulkInventoryImportJob, as: "job" }],
      order: [["created", "ASC"]],
      limit: batchSize,
    });

    if (items.length === 0) {
      return result;
    }

    const jobIds = [...new Set(items.map((item) => item.jobId))];
    result.jobsTouched = jobIds.length;
    await db.models.BulkInventoryImportJob.update(
      { status: BulkInventoryImportJobStatus.IMPORTING },
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

    for (const jobId of jobIds) {
      await BulkInventoryImportJobService.refreshJobCounts(jobId);
    }

    logger.info(result, "Processed bulk inventory import batch");
    return result;
  }
}
