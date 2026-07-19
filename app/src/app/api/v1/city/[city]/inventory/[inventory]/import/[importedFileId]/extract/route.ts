/**
 * @swagger
 * /api/v1/city/{city}/inventory/{inventory}/import/{importedFileId}/extract:
 *   post:
 *     tags:
 *       - city
 *       - inventory
 *       - import
 *     operationId: extractInventoryFromPdf
 *     summary: Start AI extraction on an uploaded PDF (Path C).
 *     description: |
 *       Returns 202 Accepted and runs extraction in the background. Client should poll
 *       GET .../import/{importedFileId} until importStatus is waiting_for_approval or failed.
 *       Only allowed when fileType is pdf and importStatus is pending_ai_extraction.
 *       Hard pre-background failures (missing file, PDF→text errors) set importStatus to
 *       failed with an actionable errorLog before returning the HTTP error (fail-closed).
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
 *         description: Extraction started; poll GET import status until completion.
 *       400:
 *         description: File is not a PDF, not pending, or PDF text extraction failed (status may be failed).
 *       404:
 *         description: Import file not found or access denied.
 *       401:
 *         description: Unauthorized.
 */

import UserService from "@/backend/UserService";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { ImportStatusEnum } from "@/util/enums";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { pdfBufferToText } from "@/backend/PdfToTextService";
import { extractInventoryRowsFromDocument } from "@/backend/InventoryExtractionService";
import { LLMError } from "@/backend/llm";
import { logger } from "@/services/logger";

/** Quick response so request returns before ingress timeout; extraction runs in background. */
export const maxDuration = 30;

/**
 * Persist a terminal failed status for Path C so clients never hang on pending_ai_extraction.
 *
 * @param importedFile - Sequelize model instance for the uploaded PDF
 * @param message - Actionable error shown via errorLog / polling
 */
async function markExtractFailed(
  importedFile: {
    update: (values: Record<string, unknown>) => Promise<unknown>;
  },
  message: string,
): Promise<void> {
  await importedFile.update({
    importStatus: ImportStatusEnum.FAILED,
    errorLog: message,
    lastUpdated: new Date(),
  });
}

async function runExtractionInBackground(
  cityId: string,
  inventoryId: string,
  importedFileId: string,
  text: string,
  targetYear: number | undefined,
): Promise<void> {
  const importedFile = await db.models.ImportedInventoryFile.findOne({
    where: {
      id: importedFileId,
      inventoryId,
      cityId,
    },
  });
  if (!importedFile) {
    logger.warn({ importedFileId }, "Background extract: file no longer found");
    return;
  }
  try {
    // Serialize progress DB writes when Path C chunks complete in parallel.
    let progressWriteChain: Promise<void> = Promise.resolve();
    const rows = await extractInventoryRowsFromDocument(text, {
      targetYear,
      onChunkProgress: (current, total) => {
        progressWriteChain = progressWriteChain.then(async () => {
          await importedFile.update({
            mappingConfiguration: {
              ...(importedFile.mappingConfiguration || {}),
              extractionProgress: { current, total },
            },
          });
        });
        return progressWriteChain;
      },
    });
    if (!rows || rows.length === 0) {
      await markExtractFailed(
        importedFile,
        "PDF does not contain extractable inventory data",
      );
      return;
    }
    const mappingConfiguration = {
      ...(importedFile.mappingConfiguration || {}),
      rows,
      extractionProgress: undefined,
    };
    await importedFile.update({
      importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
      mappingConfiguration,
      rowCount: rows.length,
      lastUpdated: new Date(),
    });
    logger.info(
      { importedFileId, rowCount: rows.length },
      "Background PDF extraction completed",
    );
  } catch (err) {
    const message =
      err instanceof LLMError
        ? err.message
        : err instanceof Error
          ? err.message
          : "AI extraction failed";
    logger.warn({ err, importedFileId }, "Background PDF extraction failed");
    await markExtractFailed(importedFile, message);
  }
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

    // Client misuse — leave status unchanged so a correct retry is possible.
    if (importedFile.fileType !== "pdf") {
      throw new createHttpError.BadRequest(
        "Extract is only supported for PDF files",
      );
    }

    if (importedFile.importStatus !== ImportStatusEnum.PENDING_AI_EXTRACTION) {
      throw new createHttpError.BadRequest(
        "File is not in pending AI extraction status",
      );
    }

    let pdfBuffer: Buffer;
    if (importedFile.s3Key) {
      try {
        pdfBuffer = await InventoryFileStorageService.getFileBuffer(
          importedFile.s3Key,
        );
      } catch (err) {
        logger.error(
          { err, importedFileId, s3Key: importedFile.s3Key },
          "Failed to fetch PDF from S3",
        );
        const msg = "Could not retrieve uploaded file from storage.";
        await markExtractFailed(importedFile, msg);
        throw new createHttpError.InternalServerError(msg);
      }
    } else if (importedFile.data && Buffer.isBuffer(importedFile.data)) {
      pdfBuffer = importedFile.data as Buffer;
    } else {
      const msg = "File reference is missing — please re-upload the file.";
      await markExtractFailed(importedFile, msg);
      throw new createHttpError.BadRequest(msg);
    }

    let text: string;
    try {
      const result = await pdfBufferToText(pdfBuffer);
      text = result.text;
      if (!text || !text.trim()) {
        const msg = "PDF produced no extractable text";
        await markExtractFailed(importedFile, msg);
        throw new createHttpError.BadRequest(msg);
      }
    } catch (err) {
      if (createHttpError.isHttpError(err)) throw err;
      logger.warn({ err, importedFileId }, "PDF to text failed");
      const msg =
        err instanceof Error ? err.message : "PDF text extraction failed";
      // Fail-closed: avoid leaving pending_ai_extraction after hard PDF parse errors (e.g. bad XRef).
      await markExtractFailed(importedFile, msg);
      throw new createHttpError.BadRequest(msg);
    }

    const targetYear =
      inventory.year != null && Number.isInteger(Number(inventory.year))
        ? Number(inventory.year)
        : undefined;

    await importedFile.update({
      importStatus: ImportStatusEnum.EXTRACTING,
      lastUpdated: new Date(),
    });

    runExtractionInBackground(
      cityId,
      inventoryId,
      importedFileId,
      text,
      targetYear,
    ).catch(async (err) => {
      logger.error(
        { err, importedFileId },
        "Background extraction promise rejected",
      );
      try {
        const file = await db.models.ImportedInventoryFile.findByPk(
          importedFileId,
        );
        if (
          file &&
          file.importStatus !== ImportStatusEnum.WAITING_FOR_APPROVAL &&
          file.importStatus !== ImportStatusEnum.FAILED
        ) {
          await markExtractFailed(
            file,
            err instanceof Error ? err.message : "AI extraction failed",
          );
        }
      } catch (updateErr) {
        logger.error(
          { err: updateErr, importedFileId },
          "Failed to mark extract as failed after background rejection",
        );
      }
    });

    return NextResponse.json(
      {
        data: {
          accepted: true,
          id: importedFileId,
          message:
            "Extraction started; poll GET import status until importStatus is waiting_for_approval or failed.",
        },
      },
      { status: 202 },
    );
  },
);
