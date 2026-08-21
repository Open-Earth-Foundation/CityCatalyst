/**
 * @swagger
 * /api/v1/city/{city}/inventory/{inventory}/import/{importedFileId}/interpret:
 *   post:
 *     tags:
 *       - city
 *       - inventory
 *       - import
 *     operationId: interpretTabularImport
 *     summary: Start AI interpretation on an uploaded tabular file (Path B).
 *     description: |
 *       Returns 202 Accepted and runs interpretation in the background. Client should poll
 *       GET .../import/{importedFileId} until importStatus is waiting_for_approval or failed.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: importedFileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       202:
 *         description: Interpretation started; poll GET import status until completion.
 *       400:
 *         description: File is not tabular or not in pending_ai_interpretation status.
 *       404:
 *         description: Import file not found or access denied.
 *       401:
 *         description: Unauthorized.
 */

import UserService from "@/backend/UserService";
import FileParserService, {
  type ParsedFileData,
  type ParsedSheet,
} from "@/backend/FileParserService";
import FormatAdapterService, { type AdapterType } from "@/backend/FormatAdapterService";
import ECRFImportService from "@/backend/ECRFImportService";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import {
  detectedColumnsMatchECRFStructure,
  interpretTabular,
  isKeyValueFormat,
  shapeKeyValueToRows,
  shapeTableToRows,
  shapeTableToRowsForCIRIS,
  shouldSkipInterpretForAdapter,
} from "@/backend/AIInterpretationService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { ImportStatusEnum } from "@/util/enums";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { LLMError, LLMErrorCode } from "@/backend/llm";
import { logger } from "@/services/logger";
import { planTableShapeChunks } from "@/backend/tableShapeChunking";
import {
  getLlmChunkConcurrency,
  mapPool,
} from "@/backend/asyncPool";

/** Allow time for sync validation only; interpretation runs in background. */
export const maxDuration = 30;

/** Serialize one sheet to CSV-like text (header row + data rows). Optional offset for chunking. */
function serializeSheet(sheet: ParsedSheet, maxRows = 30, offset = 0): string {
  const headers = sheet.headers.filter(Boolean);
  if (headers.length === 0) return "";

  const escape = (v: unknown): string => {
    let s: string;
    if (v == null) s = "";
    else if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      s = typeof o.error === "string" ? `#${o.error.toUpperCase()}!` : "";
    } else s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n"))
      return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines: string[] = [headers.map(escape).join(",")];
  const rows = sheet.rows.slice(offset, offset + maxRows);
  for (const row of rows) {
    const cells = headers.map((h) => escape(row[h]));
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

/**
 * Build serialized chunks of the primary sheet for chunked table-shape extraction.
 * Uses an adaptive max chunk count so medium sheets are covered; plan.truncated when capped.
 */
function getTableShapeChunks(
  parsedData: ParsedFileData,
  chunkSize: number,
): {
  chunks: string[];
  plan: ReturnType<typeof planTableShapeChunks>;
} {
  const sheet = parsedData.primarySheet;
  if (!sheet || sheet.headers.length === 0 || !sheet.rows.length) {
    return {
      chunks: [],
      plan: planTableShapeChunks(0, chunkSize),
    };
  }

  const totalRows = sheet.rows.length;
  const plan = planTableShapeChunks(totalRows, chunkSize);
  const chunks: string[] = [];
  for (
    let offset = 0;
    offset < totalRows && chunks.length < plan.maxChunks;
    offset += chunkSize
  ) {
    const content = serializeSheet(sheet, chunkSize, offset);
    if (content.split("\n").length > 1) chunks.push(content); // header + at least one row
  }
  return { chunks, plan };
}

/** Serialize all sheets for LLM (column detection only). Limit applies per sheet; when we later shape the table (non-eCRF path), we use chunked extraction via getTableShapeChunks. */
function serializeSheetsForInterpretation(
  parsedData: ParsedFileData,
  maxRowsPerSheet = 25,
  /** When true (e.g. CIRIS eCRF_3), send more rows for column detection. */
  isCIRIS = false,
): string {
  const limit = isCIRIS ? 200 : maxRowsPerSheet;
  const parts: string[] = [];
  const seen = new Set<ParsedSheet>();
  if (parsedData.primarySheet) {
    const content = serializeSheet(parsedData.primarySheet, limit);
    if (content) {
      parts.push(`Sheet: ${parsedData.primarySheet.name}\n${content}`);
      seen.add(parsedData.primarySheet);
    }
  }
  for (const sheet of parsedData.sheets) {
    if (seen.has(sheet)) continue;
    const content = serializeSheet(sheet, limit);
    if (!content) continue;
    parts.push(`Sheet: ${sheet.name}\n${content}`);
  }
  return parts.join("\n\n");
}

type InterpretBackgroundPayload = {
  cityId: string;
  inventoryId: string;
  importedFileId: string;
  documentContent: string;
  targetYear: number | undefined;
  targetCity: string | undefined;
  keyValueFormat: boolean;
  /** When true, use CIRIS prompt and full ECRF-like schema; extract all rows. */
  isCIRIS: boolean;
  /** Format adapter used at upload (if any); drives skip-interpret optimization. */
  adapterType?: AdapterType | null;
  parsedData: ParsedFileData;
  /**
   * Past approved mapping for this city × header fingerprint (if any).
   * Injected into the AI prompt as a warm-start hint.
   */
  pastMapping?: {
    columnMapping: Record<string, string>;
    exampleRows: Record<string, unknown>[];
  } | null;
};

async function runInterpretationInBackground(
  payload: InterpretBackgroundPayload,
): Promise<void> {
  const {
    cityId,
    inventoryId,
    importedFileId,
    documentContent,
    targetYear,
    targetCity,
    keyValueFormat,
    isCIRIS,
    adapterType,
    parsedData,
    pastMapping,
  } = payload;

  const importedFile = await db.models.ImportedInventoryFile.findOne({
    where: {
      id: importedFileId,
      inventoryId,
      cityId,
    },
  });

  if (!importedFile) {
    logger.warn(
      { importedFileId, inventoryId, cityId },
      "Import file not found in background interpret",
    );
    return;
  }

  const setFailed = async (message: string) => {
    await importedFile.update({
      importStatus: ImportStatusEnum.FAILED,
      errorLog: message,
      lastUpdated: new Date(),
    });
  };

  try {
    if (keyValueFormat) {
      const shapedRows = await shapeKeyValueToRows(documentContent, {
        targetYear,
        targetCity,
        pastMapping,
      });
      if (!shapedRows.length) {
        await setFailed(
          "Key-value table could not be shaped into inventory rows; check column headers and values",
        );
        return;
      }
      const validationResults = importedFile.validationResults ?? {};
      await importedFile.update({
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        validationResults: {
          ...validationResults,
          keyValueShaped: true,
          processingResults: {
            rowCount: shapedRows.length,
            validRowCount: shapedRows.length,
          },
        },
        rowCount: shapedRows.length,
        mappingConfiguration: {
          keyValueShaped: true,
          rows: shapedRows,
        },
        lastUpdated: new Date(),
      });
      logger.info(
        { importedFileId: importedFile.id, rowCount: shapedRows.length },
        "Path B key-value shaping completed, waiting for approval",
      );
      return;
    }

    // Adapter-normalized tidy tables rarely match eCRF mapping; skip interpretTabular
    // and shape directly (one fewer LLM round-trip on Path B long-tidy / wide-year).
    const skipInterpret =
      !isCIRIS && shouldSkipInterpretForAdapter(adapterType);

    let detectedColumns: Record<string, number> = {};
    if (!skipInterpret) {
      try {
        detectedColumns = await interpretTabular(documentContent, {
          targetYear,
          targetCity,
        });
      } catch (err) {
        if (err instanceof LLMError) {
          const msg =
            err.code === LLMErrorCode.BAD_REQUEST
              ? err.message || "Document content could not be processed"
              : err.message || "AI interpretation failed";
          await setFailed(msg);
          return;
        }
        await setFailed(err instanceof Error ? err.message : "Unknown error");
        return;
      }
    } else {
      logger.info(
        { importedFileId, adapterType },
        "Skipping interpretTabular; adapter-normalized file uses shape-only Path B",
      );
    }

    if (
      skipInterpret ||
      !detectedColumnsMatchECRFStructure(detectedColumns)
    ) {
      const chunkSize = isCIRIS ? 200 : 100;
      const { chunks, plan } = getTableShapeChunks(parsedData, chunkSize);
      const shapeOptions = { targetYear, targetCity, pastMapping };

      if (
        (parsedData.primarySheet?.rows.length ?? 0) > 0 &&
        chunks.length === 0
      ) {
        await setFailed(
          "Table could not be split into shape chunks; check sheet headers and rows",
        );
        return;
      }

      if (plan.truncated) {
        logger.warn(
          {
            importedFileId,
            totalRows: plan.totalRows,
            coveredRows: plan.coveredRows,
            maxChunks: plan.maxChunks,
            chunksNeeded: plan.chunksNeeded,
          },
          "Path B shape truncated: rows beyond absolute chunk cap will be omitted",
        );
      }

      let shapedRows: Awaited<ReturnType<typeof shapeTableToRows>> = [];
      try {
        if (chunks.length > 0) {
          // Serialize progress DB writes so parallel completions do not clobber mappingConfiguration.
          let progressWriteChain: Promise<void> = Promise.resolve();
          const enqueueProgressUpdate = (
            completedCount: number,
            total: number,
          ) => {
            progressWriteChain = progressWriteChain.then(async () => {
              await importedFile.update({
                mappingConfiguration: {
                  ...(importedFile.mappingConfiguration || {}),
                  extractionProgress: {
                    current: completedCount,
                    total,
                  },
                  shapeTruncated: plan.truncated || undefined,
                  shapeCoveredRows: plan.coveredRows,
                  shapeTotalRows: plan.totalRows,
                },
                lastUpdated: new Date(),
              });
            });
            return progressWriteChain;
          };

          const concurrency = getLlmChunkConcurrency();
          const perChunkRows = await mapPool(
            chunks,
            concurrency,
            async (chunkContent) =>
              isCIRIS
                ? shapeTableToRowsForCIRIS(chunkContent, shapeOptions)
                : shapeTableToRows(chunkContent, shapeOptions),
            async (completedCount, total) => {
              await enqueueProgressUpdate(completedCount, total);
            },
          );
          shapedRows = perChunkRows.flat();
          logger.debug(
            {
              importedFileId,
              chunkCount: chunks.length,
              concurrency,
              totalShapedRows: shapedRows.length,
              truncated: plan.truncated,
            },
            "Table shape chunks merged",
          );

          // DEBUG: inspect first extracted row and count nulls per field
          if (shapedRows.length > 0) {
            const TRACKED_FIELDS = [
              "sector", "subsector", "gpcRefNo", "scope", "year",
              "totalCO2e", "co2", "ch4", "n2o",
              "activityType", "activityAmount", "activityUnit",
              "source", "methodology",
            ] as const;
            const nullCounts: Record<string, number> = {};
            for (const field of TRACKED_FIELDS) {
              nullCounts[field] = shapedRows.filter(
                (r) => r[field] == null,
              ).length;
            }
            logger.debug(
              {
                importedFileId,
                firstRow: shapedRows[0],
                nullCountsPerField: nullCounts,
                totalRows: shapedRows.length,
              },
              "[DEBUG] AI extraction result — null counts per field",
            );
          }
        }
      } catch (err) {
        if (err instanceof LLMError) {
          const msg =
            err.code === LLMErrorCode.BAD_REQUEST
              ? err.message || "Document content could not be processed"
              : err.message || "AI interpretation failed";
          await setFailed(msg);
          return;
        }
        await setFailed(err instanceof Error ? err.message : "Unknown error");
        return;
      }
      if (!shapedRows.length && !keyValueFormat) {
        try {
          const keyValueRows = await shapeKeyValueToRows(documentContent, {
            targetYear,
            targetCity,
            pastMapping,
          });
          if (keyValueRows.length > 0) {
            shapedRows = keyValueRows;
          }
        } catch (fallbackErr) {
          logger.debug({ err: fallbackErr, importedFileId }, "Key-value fallback after empty table shape");
        }
      }
      if (!shapedRows.length) {
        await setFailed("i18n:ai-extract-no-rows");
        return;
      }
      const validationResults = importedFile.validationResults ?? {};
      const existingWarnings = Array.isArray(validationResults.warnings)
        ? validationResults.warnings
        : [];
      const truncationWarning = plan.truncated
        ? `Shape truncated: processed ${plan.coveredRows} of ${plan.totalRows} rows (max ${plan.maxChunks} chunks × ${plan.chunkSize} rows). Re-split the file or raise ABSOLUTE_MAX_TABLE_SHAPE_CHUNKS.`
        : null;
      await importedFile.update({
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        validationResults: {
          ...validationResults,
          keyValueShaped: true,
          warnings: truncationWarning
            ? [...existingWarnings, truncationWarning]
            : existingWarnings,
          processingResults: {
            rowCount: shapedRows.length,
            validRowCount: shapedRows.length,
          },
        },
        rowCount: shapedRows.length,
        mappingConfiguration: {
          keyValueShaped: true,
          rows: shapedRows,
          extractionProgress: undefined,
          shapeTruncated: plan.truncated || undefined,
          shapeCoveredRows: plan.coveredRows,
          shapeTotalRows: plan.totalRows,
        },
        lastUpdated: new Date(),
      });
      logger.info(
        { importedFileId: importedFile.id, rowCount: shapedRows.length },
        "Path B AI reshape completed (non-eCRF mapping), waiting for approval",
      );
      return;
    }

    let importResult: Awaited<
      ReturnType<typeof ECRFImportService.processECRFFile>
    >;
    try {
      importResult = await ECRFImportService.processECRFFile(
        parsedData,
        detectedColumns,
      );
    } catch (err) {
      logger.error(
        { err, importedFileId },
        "ECRF process failed after interpretation",
      );
      await setFailed(err instanceof Error ? err.message : "Unknown error");
      return;
    }

    const validationResults = importedFile.validationResults ?? {};
    const existingErrors = Array.isArray(validationResults.errors)
      ? validationResults.errors
      : [];
    const existingWarnings = Array.isArray(validationResults.warnings)
      ? validationResults.warnings
      : [];

    await importedFile.update({
      importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
      validationResults: {
        ...validationResults,
        errors: existingErrors,
        warnings: [...existingWarnings, ...importResult.warnings],
        detectedColumns,
        inferredYearFromFile: importResult.inferredYearFromFile,
        processingResults: {
          rowCount: importResult.rowCount,
          validRowCount: importResult.validRowCount,
          errors: importResult.errors,
          warnings: importResult.warnings,
        },
      },
      rowCount: importResult.rowCount,
      mappingConfiguration: {
        rows: importResult.rows.map((row) => ({
          gpcRefNo: row.gpcRefNo,
          sectorId: row.sectorId,
          subsectorId: row.subsectorId,
          subcategoryId: row.subcategoryId,
          scopeId: row.scopeId,
          hasErrors: !!row.errors && row.errors.length > 0,
          hasWarnings: !!row.warnings && row.warnings.length > 0,
        })),
      },
      lastUpdated: new Date(),
    });

    logger.info(
      {
        importedFileId: importedFile.id,
        rowCount: importResult.rowCount,
        validRowCount: importResult.validRowCount,
      },
      "Path B interpretation completed, waiting for approval",
    );
  } catch (err) {
    logger.error({ err, importedFileId }, "Interpret background error");
    await setFailed(err instanceof Error ? err.message : "Unknown error");
  }
}

export const POST = apiHandler(async (_req, { session, params }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Not signed in");
  }

  const cityId = z.string().uuid().parse(params.city);
  const inventoryId = z.string().uuid().parse(params.inventory);
  const importedFileId = z.string().uuid().parse(params.importedFileId);

  const inventory = await UserService.findUserInventory(inventoryId, session);

  const importedFile = await db.models.ImportedInventoryFile.findOne({
    where: {
      id: importedFileId,
      inventoryId,
      cityId,
      userId: session.user.id,
    },
  });

  if (!importedFile) {
    throw new createHttpError.NotFound(
      "Imported file not found or access denied",
    );
  }

  if (importedFile.fileType !== "xlsx" && importedFile.fileType !== "csv") {
    throw new createHttpError.BadRequest(
      "Interpret is only supported for xlsx or csv files (Path B)",
    );
  }

  if (importedFile.importStatus === ImportStatusEnum.WAITING_FOR_APPROVAL) {
    await importedFile.reload();
    return NextResponse.json({
      data: {
        id: importedFile.id,
        userId: importedFile.userId,
        cityId: importedFile.cityId,
        inventoryId: importedFile.inventoryId,
        fileName: importedFile.fileName,
        fileType: importedFile.fileType,
        fileSize: importedFile.fileSize,
        originalFileName: importedFile.originalFileName,
        importStatus: importedFile.importStatus,
        rowCount: importedFile.rowCount,
        created: importedFile.created,
        lastUpdated: importedFile.lastUpdated,
      },
    });
  }
  if (importedFile.importStatus === ImportStatusEnum.FAILED) {
    await importedFile.reload();
    return NextResponse.json({
      data: {
        id: importedFile.id,
        importStatus: importedFile.importStatus,
        errorLog: importedFile.errorLog ?? undefined,
        userId: importedFile.userId,
        cityId: importedFile.cityId,
        inventoryId: importedFile.inventoryId,
        fileName: importedFile.fileName,
        fileType: importedFile.fileType,
        fileSize: importedFile.fileSize,
        originalFileName: importedFile.originalFileName,
        rowCount: importedFile.rowCount,
        created: importedFile.created,
        lastUpdated: importedFile.lastUpdated,
      },
    });
  }
  if (
    importedFile.importStatus !== ImportStatusEnum.PENDING_AI_INTERPRETATION
  ) {
    throw new createHttpError.BadRequest(
      "File is not in pending AI interpretation status",
    );
  }

  let buffer: Buffer;
  if (importedFile.s3Key) {
    try {
      buffer = await InventoryFileStorageService.getFileBuffer(importedFile.s3Key);
    } catch (err) {
      logger.error({ err, importedFileId, s3Key: importedFile.s3Key }, "Failed to fetch file from S3 for interpretation");
      throw new createHttpError.InternalServerError(
        "Could not retrieve uploaded file from storage.",
      );
    }
  } else if (importedFile.data && Buffer.isBuffer(importedFile.data)) {
    buffer = importedFile.data as Buffer;
  } else {
    throw new createHttpError.InternalServerError(
      "File reference is missing — please re-upload the file.",
    );
  }

  let parsedData: ParsedFileData;
  try {
    parsedData = await FileParserService.parseFile(
      buffer,
      importedFile.fileType,
    );
  } catch (err) {
    logger.error(
      { err, importedFileId },
      "Failed to parse file for interpretation",
    );
    throw new createHttpError.BadRequest(
      `Failed to parse file: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
  }

  const primarySheet = parsedData.primarySheet;
  if (!primarySheet || primarySheet.headers.length === 0) {
    throw new createHttpError.BadRequest("File has no recognizable header row");
  }

  const validationResults = (importedFile.validationResults ?? {}) as {
    isCIRIS?: boolean;
    adapterType?: string;
    headerKey?: string;
  };
  const isCIRIS = validationResults.isCIRIS === true;
  const adapterType = validationResults.adapterType as AdapterType | undefined;
  const headerKey = validationResults.headerKey as string | undefined;

  const targetYear =
    inventory.year != null && Number.isInteger(Number(inventory.year))
      ? Number(inventory.year)
      : undefined;

  // For Adapter A/B/C files: normalize raw ParsedFileData into a clean flat table
  // before passing to the AI. This lets the AI focus on GPC semantic mapping
  // rather than untangling structural formatting.
  let effectiveParsedData = parsedData;
  if (adapterType && adapterType !== "near-ecrf") {
    try {
      const normalized = FormatAdapterService.normalize(
        parsedData,
        adapterType,
        targetYear,
      );
      const normalizedRowCount = normalized.primarySheet?.rows.length ?? 0;
      if (normalizedRowCount > 0) {
        effectiveParsedData = normalized;
        logger.info(
          { importedFileId, adapterType, normalizedRows: normalizedRowCount },
          "Format adapter normalization applied before AI interpretation",
        );
      } else {
        // Normalization produced nothing — fall back to raw data so AI still gets something
        logger.warn(
          { importedFileId, adapterType, targetYear },
          "Adapter normalization returned 0 rows; falling back to raw parsed data",
        );
      }
    } catch (normalizeErr) {
      logger.warn(
        { err: normalizeErr, importedFileId, adapterType },
        "Format adapter normalization failed; proceeding with raw parsed data",
      );
    }
  }

  // DEBUG: log normalized headers and first row so we can confirm adapter output
  if (effectiveParsedData.primarySheet) {
    const sheet = effectiveParsedData.primarySheet;
    logger.debug(
      {
        importedFileId,
        adapterType: adapterType ?? "none",
        normalizedHeaders: sheet.headers,
        sampleRow: sheet.rows[0] ?? null,
        totalRows: sheet.rows.length,
      },
      "[DEBUG] Normalized table sent to AI",
    );
  }

  const documentContent = serializeSheetsForInterpretation(effectiveParsedData, 100, isCIRIS);

  const city = await db.models.City.findByPk(cityId, {
    attributes: ["name"],
  });
  const targetCity = city?.name?.trim() || undefined;

  const keyValueFormat = isKeyValueFormat(
    effectiveParsedData.primarySheet?.headers ?? primarySheet.headers,
  );

  // Look up any previously approved mapping for this city × header fingerprint.
  // If found, it will be injected into the AI prompt as a warm-start hint.
  let pastMapping: InterpretBackgroundPayload["pastMapping"] = null;
  if (headerKey) {
    try {
      const feedback = await db.models.ImportMappingFeedback.findOne({
        where: { cityId, headerKey },
      });
      if (feedback) {
        pastMapping = {
          columnMapping: feedback.columnMapping,
          exampleRows: feedback.exampleRows,
        };
        logger.info(
          { importedFileId, cityId, headerKey },
          "Past mapping feedback found — will inject into AI prompt",
        );
      }
    } catch (err) {
      logger.warn(
        { err, cityId, headerKey },
        "Failed to look up mapping feedback (non-fatal)",
      );
    }
  }

  runInterpretationInBackground({
    cityId,
    inventoryId,
    importedFileId,
    documentContent,
    targetYear,
    targetCity,
    keyValueFormat,
    isCIRIS,
    adapterType: adapterType ?? null,
    parsedData: effectiveParsedData,
    pastMapping,
  }).catch((err) =>
    logger.error({ err, importedFileId }, "Interpret background failed"),
  );

  return NextResponse.json(
    {
      data: {
        accepted: true,
        id: importedFileId,
        message:
          "Interpretation started; poll GET import status until importStatus is waiting_for_approval or failed.",
      },
    },
    { status: 202 },
  );
});
