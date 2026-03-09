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
 *         description: File is not a PDF or not in pending_ai_extraction status.
 *       404:
 *         description: Import file not found or access denied.
 *       401:
 *         description: Unauthorized.
 */

import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { ImportStatusEnum } from "@/util/enums";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { pdfBufferToText } from "@/backend/PdfToTextService";
import {
  extractInventoryRowsFromDocument,
  type ExtractedRow,
} from "@/backend/InventoryExtractionService";
import { LLMError, LLMErrorCode } from "@/backend/llm";
import { logger } from "@/services/logger";

/** Quick response so request returns before ingress timeout; extraction runs in background. */
export const maxDuration = 30;

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
    const rows = await extractInventoryRowsFromDocument(text, {
      targetYear,
      onChunkProgress: async (current, total) => {
        await importedFile.update({
          mappingConfiguration: {
            ...(importedFile.mappingConfiguration || {}),
            extractionProgress: { current, total },
          },
        });
      },
    });
    if (!rows || rows.length === 0) {
      await importedFile.update({
        importStatus: ImportStatusEnum.FAILED,
        errorLog: "PDF does not contain extractable inventory data",
        lastUpdated: new Date(),
      });
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
    await importedFile.update({
      importStatus: ImportStatusEnum.FAILED,
      errorLog: message,
      lastUpdated: new Date(),
    });
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

    const data = importedFile.data;
    if (!data || !Buffer.isBuffer(data)) {
      throw new createHttpError.BadRequest("No PDF data available to extract");
    }

    let text: string;
    try {
      const result = await pdfBufferToText(data);
      text = result.text;
      if (!text || !text.trim()) {
        throw new createHttpError.BadRequest(
          "PDF produced no extractable text",
        );
      }
    } catch (err) {
      if (createHttpError.isHttpError(err)) throw err;
      logger.warn({ err, importedFileId }, "PDF to text failed");
      throw new createHttpError.BadRequest(
        err instanceof Error ? err.message : "PDF text extraction failed",
      );
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
    ).catch((err) => {
      logger.error({ err, importedFileId }, "Background extraction promise rejected");
    });

    return NextResponse.json(
      {
        data: {
          accepted: true,
          id: importedFileId,
          message: "Extraction started; poll GET import status until importStatus is waiting_for_approval or failed.",
        },
      },
      { status: 202 },
    );
  },
);
