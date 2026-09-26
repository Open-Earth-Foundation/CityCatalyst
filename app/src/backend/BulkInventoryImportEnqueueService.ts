import { randomUUID } from "node:crypto";
import { Op } from "sequelize";
import createHttpError from "http-errors";
import { db } from "@/models";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import AdminService, { CityInventoryShellError } from "@/backend/AdminService";
import OpenClimateService from "@/backend/OpenClimateService";
import {
  matchFile,
  normalizeCityName,
  normalizeLocode,
  pickLatestExports,
  type BulkInventoryImportMatchResult,
  type MatchableCity,
} from "@/backend/BulkInventoryImportMatcher";
import {
  BulkInventoryImportZipError,
  unpackBulkInventoryImportZip,
  type BulkInventoryImportZipEntry,
} from "@/backend/BulkInventoryImportZip";
import {
  normalizeCountryLocode,
  type OpenClimateCityResolveResult,
} from "@/backend/openclimate-city-search";
import { logger } from "@/services/logger";
import {
  BulkInventoryImportItemStatus,
  BulkInventoryImportJobStatus,
  BulkInventoryImportMatchError,
  BulkInventoryImportStage,
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import {
  BulkInventoryImportJobService,
  rollupItemCounts,
} from "@/backend/BulkInventoryImportJobService";

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
  /** Optional ISO-2 country to scope OpenClimate name search (`BR`, `CL`). */
  countryLocode?: string | null;
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

function findCitiesByLocode(
  cities: MatchableCity[],
  locode: string,
): MatchableCity[] {
  const key = normalizeLocode(locode);
  return cities.filter(
    (city) => city.locode != null && normalizeLocode(city.locode) === key,
  );
}

function matchErrorLog(
  error: BulkInventoryImportMatchError,
  openClimate?: OpenClimateCityResolveResult,
): string {
  if (
    error === BulkInventoryImportMatchError.UNMATCHED_CITY &&
    openClimate?.kind === "unique"
  ) {
    return `No city in this project matched the file. OpenClimate matched ${openClimate.actorId} (${openClimate.name}). Enable create missing cities to add it.`;
  }
  if (
    error === BulkInventoryImportMatchError.AMBIGUOUS_CITY &&
    openClimate?.kind === "ambiguous"
  ) {
    const locodes = openClimate.candidates.map((c) => c.actorId).join(", ");
    return `More than one OpenClimate city matched the file: ${locodes}`;
  }
  return MATCH_ERROR_LOG[error];
}

/**
 * When the project has no city for this filename, search OpenClimate the same
 * way onboarding does. Unique exact name (+ optional country) attaches a locode.
 */
async function applyOpenClimateFallback(
  result: BulkInventoryImportMatchResult,
  cities: MatchableCity[],
  countryLocode: string | null,
  cache: Map<string, OpenClimateCityResolveResult>,
): Promise<OpenClimateCityResolveResult | undefined> {
  if (result.error !== BulkInventoryImportMatchError.UNMATCHED_CITY) {
    return undefined;
  }
  // INE / locode identity is enough; do not require OpenClimate for Chile.
  if (result.parsed.ineCode || result.parsed.locode) {
    return undefined;
  }
  const cityName = result.parsed.cityName;
  if (!cityName) return undefined;

  const cacheKey = `${normalizeCityName(cityName)}|${countryLocode ?? ""}`;
  let resolved = cache.get(cacheKey);
  if (!resolved) {
    resolved = await OpenClimateService.resolveCityByName(
      cityName,
      countryLocode,
    );
    cache.set(cacheKey, resolved);
  }

  if (resolved.kind === "none") return resolved;

  if (resolved.kind === "ambiguous") {
    result.error = BulkInventoryImportMatchError.AMBIGUOUS_CITY;
    return resolved;
  }

  result.parsed.locode = resolved.actorId;
  result.locode = resolved.actorId;
  result.warnings = [...result.warnings, "openclimate_match"];

  const locodeHits = findCitiesByLocode(cities, resolved.actorId);
  if (locodeHits.length === 1) {
    result.cityId = locodeHits[0].cityId;
    result.locode = locodeHits[0].locode ?? resolved.actorId;
    result.error = undefined;
  } else if (locodeHits.length > 1) {
    result.error = BulkInventoryImportMatchError.AMBIGUOUS_CITY;
  }
  return resolved;
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
    const countryLocode = normalizeCountryLocode(input.countryLocode);
    const ocCache = new Map<string, OpenClimateCityResolveResult>();

    const matched: Array<{
      entry: BulkInventoryImportZipEntry;
      result: BulkInventoryImportMatchResult;
      openClimate?: OpenClimateCityResolveResult;
    }> = [];
    for (const entry of unpacked.entries) {
      const result = matchFile(
        {
          originalFileName: entry.basename,
          fileSizeBytes: entry.buffer.length,
        },
        matchOptions,
      );
      const openClimate = await applyOpenClimateFallback(
        result,
        matchOptions.cities,
        countryLocode,
        ocCache,
      );
      matched.push({ entry, result, openClimate });
    }

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
      progressStage: BulkInventoryImportStage.MATCHING_FILES,
    });

    logger.info(
      {
        jobId,
        replaceExisting: input.replaceExisting ?? false,
        createMissingCities,
        dryRun,
      },
      "Bulk inventory import job created",
    );

    const itemRows = [];
    const enrichedKeys = new Set<string>();
    for (const row of matched) {
      const { entry, result, openClimate } = row;
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
          ? matchErrorLog(result.error, openClimate)
          : null;
      const warnings: string[] = [...result.warnings];
      let didShell = false;

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
            const inventoryYear = result.year ?? input.year;
            const progressDetail =
              result.parsed.cityName ??
              result.parsed.locode ??
              result.parsed.ineCode ??
              locode ??
              entry.basename;
            await BulkInventoryImportJobService.setProgress(
              jobId,
              BulkInventoryImportStage.CREATING_CITY,
              progressDetail,
            );
            const shell = await AdminService.findOrCreateCityAndInventory({
              projectId: input.projectId,
              year: inventoryYear,
              cityName: result.parsed.cityName ?? null,
              locode: result.parsed.locode ?? result.parsed.ineCode ?? locode,
              inventoryType,
              gwp,
              userId: input.userId,
              onProgress: async (stage, detail) => {
                await BulkInventoryImportJobService.setProgress(
                  jobId,
                  stage,
                  detail,
                );
              },
            });
            cityId = shell.cityId;
            resolvedInventoryId = shell.inventoryId;
            locode = shell.locode;
            inventoryByCityYear.set(
              `${shell.cityId}:${inventoryYear}`,
              shell.inventoryId,
            );
            if (shell.createdCity) warnings.push("created_city");
            if (shell.createdInventory) warnings.push("created_inventory");
            status = BulkInventoryImportItemStatus.PENDING;
            errorCode = null;
            errorLog = null;
            didShell = true;
            if (shell.locode) {
              enrichedKeys.add(`${shell.locode}|${inventoryYear}|${shell.cityId}`);
            }
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

      const inventoryYear = result.year ?? input.year;
      if (
        !dryRun &&
        !didShell &&
        cityId &&
        locode &&
        inventoryYear != null &&
        status === BulkInventoryImportItemStatus.PENDING
      ) {
        const enrichKey = `${locode}|${inventoryYear}|${cityId}`;
        if (!enrichedKeys.has(enrichKey)) {
          enrichedKeys.add(enrichKey);
          await BulkInventoryImportJobService.setProgress(
            jobId,
            BulkInventoryImportStage.ENRICHING_POPULATION,
            locode,
          );
          await AdminService.enrichCityBestEffort(
            locode,
            inventoryYear,
            cityId,
            input.projectId,
          );
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
      progressStage:
        counts.pending > 0
          ? BulkInventoryImportStage.IMPORTING_FILES
          : null,
      progressDetail: null,
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
