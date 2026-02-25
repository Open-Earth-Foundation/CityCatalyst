/**
 * @swagger
 * /api/v1/city/{city}/inventory/{inventory}/import/{importedFileId}/extract:
 *   post:
 *     tags:
 *       - city
 *       - inventory
 *       - import
 *     operationId: extractInventoryFromPdf
 *     summary: Run AI extraction on an uploaded PDF (Path C).
 *     description: |
 *       Loads the stored PDF, extracts text, runs LLM extraction to get inventory rows,
 *       stores rows in mappingConfiguration.rows and sets importStatus to waiting_for_approval.
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
 *       200:
 *         description: Extraction completed; returns updated import status and row count.
 *       400:
 *         description: File is not a PDF or not in pending_ai_extraction status.
 *       404:
 *         description: Import file not found or access denied.
 *       502:
 *         description: LLM or PDF extraction failed (e.g. timeout, parse error).
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

/** Allow long-running PDF + LLM extraction. */
export const maxDuration = 120;

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

    let rows: ExtractedRow[];
    try {
      rows = await extractInventoryRowsFromDocument(text, {
        targetYear,
      });
    } catch (err) {
      if (err instanceof LLMError) {
        logger.warn(
          { code: err.code, message: err.message, importedFileId },
          "LLM extraction failed",
        );
        if (err.code === LLMErrorCode.BAD_REQUEST) {
          throw new createHttpError.BadRequest(
            err.message || "Document content could not be processed",
          );
        }
        throw new createHttpError.BadGateway(
          err.message || "AI extraction failed",
        );
      }
      throw err;
    }

    if (!rows || rows.length === 0) {
      logger.warn(
        { importedFileId },
        "LLM extraction produced no inventory rows",
      );
      throw new createHttpError.BadRequest(
        "PDF does not contain extractable inventory data",
      );
    }

    const mappingConfiguration = {
      ...(importedFile.mappingConfiguration || {}),
      rows,
    };

    await importedFile.update({
      importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
      mappingConfiguration,
      rowCount: rows.length,
      lastUpdated: new Date(),
    });

    return NextResponse.json({
      data: {
        id: importedFile.id,
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        rowCount: rows.length,
      },
    });
  },
);
