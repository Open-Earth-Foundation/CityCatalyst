import { randomUUID } from "node:crypto";
import { Op } from "sequelize";
import createHttpError from "http-errors";
import { db } from "@/models";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import AdminService, { CityInventoryShellError } from "@/backend/AdminService";
import {
  matchFile,
  pickLatestExports,
} from "@/backend/BulkInventoryImportMatcher";
import {
  BulkInventoryImportZipError,
  unpackBulkInventoryImportZip,
  type BulkInventoryImportZipEntry,
} from "@/backend/BulkInventoryImportZip";
import { logger } from "@/services/logger";
import {
  BulkInventoryImportItemStatus,
  BulkInventoryImportJobStatus,
  BulkInventoryImportMatchError,
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { rollupItemCounts } from "@/backend/BulkInventoryImportJobService";

export interface EnqueueBulkInventoryImportInput {
  projectId: string;
  year: number;
  zipBuffer: Buffer;
  zipFileName: string;
  userId: string;
  dryRun?: boolean;
  createMissingCities?: boolean;
  replaceExisting?: boolean;
  inventoryType?: InventoryTypeEnum;
  gwp?: GlobalWarmingPotentialTypeEnum;
}

export interface EnqueueBulkInventoryImportResult {
  jobId: string;
  itemCount: number;
  unmatchedCount: number;
}

const MATCH_ERROR_LOG: Record<BulkInventoryImportMatchError, string> = {
  [BulkInventoryImportMatchError.UNMATCHED_CITY]:
    "No city in this project matched the file",
  [BulkInventoryImportMatchError.AMBIGUOUS_CITY]:
    "More than one city in this project matched the file",
  [BulkInventoryImportMatchError.MISSING_YEAR]:
    "Could not resolve an inventory year from the filename, manifest, or job",
  [BulkInventoryImportMatchError.UNSUPPORTED_EXTENSION]:
    "Only xlsx and csv inventory files are supported",
  [BulkInventoryImportMatchError.FILE_TOO_LARGE]:
    "Inner file exceeds the 20 MiB inventory import limit",
};

function zipHttpError(err: BulkInventoryImportZipError): never {
  throw new createHttpError.BadRequest(err.code);
}

function itemStatusForMatch(
  error?: BulkInventoryImportMatchError,
): BulkInventoryImportItemStatus {
  if (!error) return BulkInventoryImportItemStatus.PENDING;
  if (
    error === BulkInventoryImportMatchError.UNMATCHED_CITY ||
    error === BulkInventoryImportMatchError.AMBIGUOUS_CITY
  ) {
    return BulkInventoryImportItemStatus.UNMATCHED;
  }
  return BulkInventoryImportItemStatus.FAILED;
}

function mimeForBasename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    return InventoryFileStorageService.mimeTypeForFileType("xlsx");
  }
  if (lower.endsWith(".csv")) {
    return InventoryFileStorageService.mimeTypeForFileType("csv");
  }
  return "application/octet-stream";
}

function safeInnerKey(entry: BulkInventoryImportZipEntry): string {
  const safe = entry.basename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `files/${safe}`;
}

function exportKey(originalFileName: string, exportDate?: string): string {
  return `${originalFileName}|${exportDate ?? ""}`;
}

export class BulkInventoryImportEnqueueService {
  static async enqueue(
    input: EnqueueBulkInventoryImportInput,
  ): Promise<EnqueueBulkInventoryImportResult> {
    const project = await db.models.Project.findByPk(input.projectId);
    if (!project) {
      throw new createHttpError.NotFound("Project not found");
    }

    let unpacked;
    try {
      unpacked = await unpackBulkInventoryImportZip(
        input.zipBuffer,
        input.zipFileName,
      );
    } catch (err) {
      if (err instanceof BulkInventoryImportZipError) zipHttpError(err);
      throw err;
    }

    const cities = await db.models.City.findAll({
      where: { projectId: input.projectId },
      attributes: ["cityId", "name", "locode"],
    });

    const matchOptions = {
      cities: cities.map((city) => ({
        cityId: city.cityId,
        name: city.name,
        locode: city.locode,
      })),
      jobDefaultYear: input.year,
      manifestCsv: unpacked.manifestCsv,
    };

    const matched = unpacked.entries.map((entry) => ({
      entry,
      result: matchFile(
        {
          originalFileName: entry.basename,
          fileSizeBytes: entry.buffer.length,
        },
        matchOptions,
      ),
    }));

    const latestKeys = new Set(
      pickLatestExports(matched.map((row) => row.result)).map((result) =>
        exportKey(result.originalFileName, result.parsed.exportDate),
      ),
    );

    const cityIds = [
      ...new Set(
        matched
          .map((row) => row.result.cityId)
          .filter((id): id is string => id != null),
      ),
    ];
    const years = [
      ...new Set(
        matched
          .map((row) => row.result.year)
          .filter((year): year is number => year != null),
      ),
    ];
    const inventories =
      cityIds.length && years.length
        ? await db.models.Inventory.findAll({
            where: {
              cityId: { [Op.in]: cityIds },
              year: { [Op.in]: years },
            },
            attributes: ["inventoryId", "cityId", "year"],
          })
        : [];
    const inventoryByCityYear = new Map(
      inventories.map((inv) => [`${inv.cityId}:${inv.year}`, inv.inventoryId]),
    );

    const inventoryType = input.inventoryType ?? InventoryTypeEnum.GPC_BASIC;
    const gwp = input.gwp ?? GlobalWarmingPotentialTypeEnum.ar6;
    const dryRun = input.dryRun ?? false;
    // Dry-run must not create city/inventory shells (IMP-009); keep the
    // requested flag on the job for the UI but skip the writes.
    const createMissingCities = input.createMissingCities ?? false;
    if (dryRun && createMissingCities) {
      logger.info(
        { projectId: input.projectId },
        "Dry-run ignores createMissingCities; no city or inventory shells will be written",
      );
    }

    const jobId = randomUUID();
    const zipS3Key = await InventoryFileStorageService.uploadBulkImportFile(
      jobId,
      "archive.zip",
      input.zipBuffer,
      "application/zip",
    );

    const job = await db.models.BulkInventoryImportJob.create({
      id: jobId,
      projectId: input.projectId,
      year: input.year,
      userId: input.userId,
      status: BulkInventoryImportJobStatus.PENDING,
      s3Key: zipS3Key,
      dryRun,
      createMissingCities,
      inventoryType,
      globalWarmingPotentialType: gwp,
      replaceExisting: input.replaceExisting ?? false,
    });

    const itemRows = [];
    for (const row of matched) {
      const { entry, result } = row;
      const superseded =
        result.parsed.exportDate != null &&
        !latestKeys.has(
          exportKey(result.originalFileName, result.parsed.exportDate),
        );

      let s3Key: string | null = null;
      try {
        s3Key = await InventoryFileStorageService.uploadBulkImportFile(
          jobId,
          safeInnerKey(entry),
          entry.buffer,
          mimeForBasename(entry.basename),
        );
      } catch (err) {
        logger.error(
          { err, jobId, file: entry.basename },
          "Failed to store bulk import inner file",
        );
        throw new createHttpError.InternalServerError(
          "Failed to store uploaded file. Please try again.",
        );
      }

      const inventoryId =
        result.cityId && result.year != null
          ? (inventoryByCityYear.get(`${result.cityId}:${result.year}`) ?? null)
          : null;

      let cityId = result.cityId;
      let resolvedInventoryId = inventoryId;
      let locode = result.locode;
      let status = superseded
        ? BulkInventoryImportItemStatus.SKIPPED
        : itemStatusForMatch(result.error);
      let errorCode: string | null = superseded
        ? "superseded_export"
        : (result.error ?? null);
      let errorLog: string | null = superseded
        ? "A newer CRFFormat export for this city and year replaced this file"
        : result.error
          ? MATCH_ERROR_LOG[result.error]
          : null;
      const warnings: string[] = [...result.warnings];

      if (!superseded) {
        const needsCity =
          !dryRun &&
          result.error === BulkInventoryImportMatchError.UNMATCHED_CITY &&
          createMissingCities;
        const needsInventory =
          !dryRun &&
          cityId != null &&
          result.year != null &&
          resolvedInventoryId == null;

        if (needsCity || needsInventory) {
          try {
            const shell = await AdminService.findOrCreateCityAndInventory({
              projectId: input.projectId,
              year: result.year ?? input.year,
              cityName: result.parsed.cityName ?? null,
              locode: result.parsed.locode ?? result.parsed.ineCode ?? locode,
              inventoryType,
              gwp,
              userId: input.userId,
            });
            cityId = shell.cityId;
            resolvedInventoryId = shell.inventoryId;
            locode = shell.locode;
            inventoryByCityYear.set(
              `${shell.cityId}:${result.year ?? input.year}`,
              shell.inventoryId,
            );
            if (shell.createdCity) warnings.push("created_city");
            if (shell.createdInventory) warnings.push("created_inventory");
            status = BulkInventoryImportItemStatus.PENDING;
            errorCode = null;
            errorLog = null;
          } catch (err) {
            if (err instanceof CityInventoryShellError) {
              status =
                err.code === "missing_city_identity"
                  ? BulkInventoryImportItemStatus.UNMATCHED
                  : BulkInventoryImportItemStatus.FAILED;
              errorCode = err.code;
              errorLog = err.message;
            } else {
              throw err;
            }
          }
        }
      }

      itemRows.push({
        jobId,
        originalFileName: entry.path,
        s3Key,
        data: s3Key ? null : entry.buffer,
        cityId,
        inventoryId: resolvedInventoryId,
        locode,
        resolvedYear: result.year,
        status,
        errorCode,
        errorLog,
        warnings: warnings.length ? warnings : null,
      });
    }

    await db.models.BulkInventoryImportItem.bulkCreate(itemRows);

    const counts = rollupItemCounts(itemRows);
    const jobStatus =
      counts.pending > 0
        ? BulkInventoryImportJobStatus.PENDING
        : BulkInventoryImportJobStatus.COMPLETED;
    await job.update({
      totalCount: counts.total,
      matchedCount: counts.matched + counts.pending,
      importedCount: counts.completed,
      failedCount: counts.failed,
      skippedCount: counts.skipped,
      status: jobStatus,
    });

    logger.info(
      {
        jobId,
        projectId: input.projectId,
        itemCount: counts.total,
        unmatchedCount: counts.unmatched,
      },
      "Enqueued bulk inventory import job",
    );

    return {
      jobId,
      itemCount: counts.total,
      unmatchedCount: counts.unmatched,
    };
  }
}
