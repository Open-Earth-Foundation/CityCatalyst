/**
 * @swagger
 * /api/v1/city/{city}/inventory/{inventory}/import/{importedFileId}/interpret:
 *   post:
 *     tags:
 *       - city
 *       - inventory
 *       - import
 *     operationId: interpretTabularImport
 *     summary: Run AI interpretation on an uploaded tabular file (Path B).
 *     description: |
 *       Loads the stored file, parses it, sends content to LLM for column mapping,
 *       processes with ECRFImportService using AI-suggested detectedColumns,
 *       then sets importStatus to waiting_for_approval. Only allowed when fileType is xlsx or csv
 *       and importStatus is pending_ai_interpretation.
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
 *       200:
 *         description: Interpretation completed; returns updated import record.
 *       400:
 *         description: File is not tabular or not in pending_ai_interpretation status.
 *       404:
 *         description: Import file not found or access denied.
 *       502:
 *         description: LLM or processing failed.
 *       401:
 *         description: Unauthorized.
 */

import UserService from "@/backend/UserService";
import FileParserService, {
  type ParsedFileData,
  type ParsedSheet,
} from "@/backend/FileParserService";
import ECRFImportService from "@/backend/ECRFImportService";
import {
  detectedColumnsMatchECRFStructure,
  interpretTabular,
  isKeyValueFormat,
  shapeKeyValueToRows,
  shapeTableToRows,
} from "@/backend/AIInterpretationService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { ImportStatusEnum } from "@/util/enums";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { LLMError, LLMErrorCode } from "@/backend/llm";
import { logger } from "@/services/logger";

/** Allow time for parse + LLM + process. */
export const maxDuration = 90;

/** Serialize one sheet to CSV-like text (header row + sample rows). */
function serializeSheet(
  sheet: ParsedSheet,
  maxRows = 30,
): string {
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
  const rows = sheet.rows.slice(0, maxRows);
  for (const row of rows) {
    const cells = headers.map((h) => escape(row[h]));
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

/** Serialize all sheets for LLM; documents may contain data on different spreadsheets. Primary sheet first so LLM column indices match the sheet we use for processing. */
function serializeSheetsForInterpretation(
  parsedData: ParsedFileData,
  maxRowsPerSheet = 25,
): string {
  const parts: string[] = [];
  const seen = new Set<ParsedSheet>();
  if (parsedData.primarySheet) {
    const content = serializeSheet(parsedData.primarySheet, maxRowsPerSheet);
    if (content) {
      parts.push(`Sheet: ${parsedData.primarySheet.name}\n${content}`);
      seen.add(parsedData.primarySheet);
    }
  }
  for (const sheet of parsedData.sheets) {
    if (seen.has(sheet)) continue;
    const content = serializeSheet(sheet, maxRowsPerSheet);
    if (!content) continue;
    parts.push(`Sheet: ${sheet.name}\n${content}`);
  }
  return parts.join("\n\n");
}

export const POST = apiHandler(
  async (_req, { session, params }) => {
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

    if (
      importedFile.importStatus !== ImportStatusEnum.PENDING_AI_INTERPRETATION
    ) {
      throw new createHttpError.BadRequest(
        "File is not in pending AI interpretation status",
      );
    }

    const buffer = importedFile.data as Buffer;
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new createHttpError.InternalServerError(
        "Stored file data is missing or invalid",
      );
    }

    let parsedData: ParsedFileData;
    try {
      parsedData = await FileParserService.parseFile(
        buffer,
        importedFile.fileType,
      );
    } catch (err) {
      logger.error({ err, importedFileId }, "Failed to parse file for interpretation");
      throw new createHttpError.BadRequest(
        `Failed to parse file: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }

    const primarySheet = parsedData.primarySheet;
    if (!primarySheet || primarySheet.headers.length === 0) {
      throw new createHttpError.BadRequest(
        "File has no recognizable header row",
      );
    }

    const documentContent = serializeSheetsForInterpretation(parsedData);

    const targetYear =
      inventory.year != null && Number.isInteger(Number(inventory.year))
        ? Number(inventory.year)
        : undefined;

    const city = await db.models.City.findByPk(cityId, {
      attributes: ["name"],
    });
    const targetCity = city?.name?.trim() || undefined;

    const keyValueFormat = isKeyValueFormat(primarySheet.headers);

    if (keyValueFormat) {
      // Key-value table: column headers = (category + scope); LLM shapes into GPC rows
      let shapedRows: Awaited<ReturnType<typeof shapeKeyValueToRows>>;
      try {
        shapedRows = await shapeKeyValueToRows(documentContent, {
          targetYear,
          targetCity,
        });
      } catch (err) {
        if (err instanceof LLMError) {
          logger.warn(
            { code: err.code, message: err.message, importedFileId },
            "Key-value shape LLM failed",
          );
          if (err.code === LLMErrorCode.BAD_REQUEST) {
            throw new createHttpError.BadRequest(
              err.message || "Document content could not be processed",
            );
          }
          throw new createHttpError.BadGateway(
            err.message || "AI interpretation failed",
          );
        }
        throw err;
      }

      if (!shapedRows.length) {
        throw new createHttpError.BadRequest(
          "Key-value table could not be shaped into inventory rows; check column headers and values",
        );
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

    let detectedColumns: Record<string, number>;
    try {
      detectedColumns = await interpretTabular(documentContent, {
        targetYear,
        targetCity,
      });
    } catch (err) {
      if (err instanceof LLMError) {
        logger.warn(
          { code: err.code, message: err.message, importedFileId },
          "LLM interpretation failed",
        );
        if (err.code === LLMErrorCode.BAD_REQUEST) {
          throw new createHttpError.BadRequest(
            err.message || "Document content could not be processed",
          );
        }
        throw new createHttpError.BadGateway(
          err.message || "AI interpretation failed",
        );
      }
      throw err;
    }

    if (!detectedColumnsMatchECRFStructure(detectedColumns)) {
      // Detected columns do not match eCRF structure → use AI to reshape table into GPC rows
      logger.info(
        { detectedColumns, importedFileId },
        "Detected columns do not match eCRF structure; using AI reshape",
      );
      let shapedRows: Awaited<ReturnType<typeof shapeTableToRows>>;
      try {
        shapedRows = await shapeTableToRows(documentContent, {
          targetYear,
          targetCity,
        });
      } catch (err) {
        if (err instanceof LLMError) {
          logger.warn(
            { code: err.code, message: err.message, importedFileId },
            "AI reshape failed",
          );
          if (err.code === LLMErrorCode.BAD_REQUEST) {
            throw new createHttpError.BadRequest(
              err.message || "Document content could not be processed",
            );
          }
          throw new createHttpError.BadGateway(
            err.message || "AI interpretation failed",
          );
        }
        throw err;
      }

      if (!shapedRows.length) {
        throw new createHttpError.BadRequest(
          "AI could not extract inventory rows from this table. Check that the file has recognizable sector/scope and emissions columns (e.g. 'Sector and scope (GPC reference number)', 'Emissions (metric tonnes CO2e)', 'Reporting year'). The response was logged for debugging.",
        );
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
        "Path B AI reshape completed (non-eCRF mapping), waiting for approval",
      );

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

    let importResult: Awaited<ReturnType<typeof ECRFImportService.processECRFFile>>;
    try {
      importResult = await ECRFImportService.processECRFFile(
        parsedData,
        detectedColumns,
      );
    } catch (err) {
      logger.error({ err, importedFileId }, "ECRF process failed after interpretation");
      await importedFile.update({
        importStatus: ImportStatusEnum.FAILED,
        errorLog: err instanceof Error ? err.message : "Unknown error",
        lastUpdated: new Date(),
      });
      throw new createHttpError.InternalServerError(
        `Failed to process file: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
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

    await importedFile.reload();

    logger.info(
      {
        importedFileId: importedFile.id,
        rowCount: importResult.rowCount,
        validRowCount: importResult.validRowCount,
      },
      "Path B interpretation completed, waiting for approval",
    );

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
  },
);
