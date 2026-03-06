/**
 * @swagger
 * /api/v1/city/{city}/inventory/{inventory}/import:
 *   post:
 *     tags:
 *       - city
 *       - inventory
 *       - import
 *     operationId: postInventoryImport
 *     summary: Upload an external inventory file for import.
 *     description: Accepts multipart/form-data to upload an external inventory file (XLSX or CSV) for import into an existing inventory. Requires a signed-in session with access to the inventory. Returns the imported file metadata with status 'uploaded'.
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
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Uploaded file metadata wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     userId:
 *                       type: string
 *                       format: uuid
 *                     cityId:
 *                       type: string
 *                       format: uuid
 *                     inventoryId:
 *                       type: string
 *                       format: uuid
 *                     fileName:
 *                       type: string
 *                     fileType:
 *                       type: string
 *                       enum: [xlsx, csv]
 *                     fileSize:
 *                       type: integer
 *                     originalFileName:
 *                       type: string
 *                     importStatus:
 *                       type: string
 *                       enum: [uploaded, validating, mapping, approved, processing, completed, failed]
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid file or payload.
 *       404:
 *         description: Inventory not found.
 *       401:
 *         description: Unauthorized.
 */

import UserService from "@/backend/UserService";
import FileValidatorService from "@/backend/FileValidatorService";
import FileParserService from "@/backend/FileParserService";
import ECRFImportService from "@/backend/ECRFImportService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { ImportStatusEnum } from "@/util/enums";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { logger } from "@/services/logger";

/** Quick response for tabular uploads; validation/processing runs in background. */
export const maxDuration = 30;

/** Run validation and optional eCRF processing for a tabular upload in the background (avoids timeout for large files e.g. CIRIS). */
async function runUploadProcessingInBackground(
  cityId: string,
  inventoryId: string,
  importedFileId: string,
): Promise<void> {
  const importedFile = await db.models.ImportedInventoryFile.findOne({
    where: { id: importedFileId, inventoryId, cityId },
  });
  if (!importedFile || importedFile.importStatus !== ImportStatusEnum.PROCESSING) {
    logger.warn({ importedFileId, inventoryId, cityId }, "Upload background: file not found or not PROCESSING");
    return;
  }

  const buffer = importedFile.data as Buffer;
  const originalFileName = (importedFile.originalFileName as string) || "upload";
  const fileType = importedFile.fileType as "xlsx" | "csv";
  const file = new File([buffer], originalFileName, {
    type: fileType === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv",
  });

  const setFailed = async (message: string) => {
    await importedFile.update({
      importStatus: ImportStatusEnum.FAILED,
      errorLog: message,
      lastUpdated: new Date(),
    });
  };

  try {
    let validationResult = await FileValidatorService.validateFileStructure(file);
    const isTabular = validationResult.fileType === "xlsx" || validationResult.fileType === "csv";
    if (!isTabular || !validationResult.isValid) {
      await setFailed(validationResult.errors?.length ? validationResult.errors.join("; ") : "File validation failed");
      return;
    }

    const usePathB =
      !FileValidatorService.hasDistinctRequiredECRFColumns(validationResult.detectedColumns || {}) ||
      !!validationResult.isCIRIS;

    if (usePathB) {
      await importedFile.update({
        importStatus: ImportStatusEnum.PENDING_AI_INTERPRETATION,
        validationResults: {
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          detectedColumns: validationResult.detectedColumns,
        },
        lastUpdated: new Date(),
      });
      logger.info({ importedFileId: importedFile.id }, "Tabular upload (Path B) validated, pending AI interpretation");
      return;
    }

    const parsedData = await FileParserService.parseFile(buffer, fileType);
    const importResult = await ECRFImportService.processECRFFile(
      parsedData,
      validationResult.detectedColumns || {},
    );
    await importedFile.update({
      importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
      validationResults: {
        errors: validationResult.errors,
        warnings: [...(validationResult.warnings || []), ...importResult.warnings],
        detectedColumns: validationResult.detectedColumns,
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
      { importedFileId: importedFile.id, rowCount: importResult.rowCount },
      "Tabular upload (eCRF) processed, waiting for approval",
    );
  } catch (error) {
    logger.error({ err: error, importedFileId: importedFile.id }, "Upload background processing failed");
    await setFailed(error instanceof Error ? error.message : "Unknown error");
  }
}

export const POST = apiHandler(
  async (req: NextRequest, { session, params }) => {
    if (!session) {
      throw new createHttpError.Unauthorized("Not signed in");
    }

    const cityId = z.string().uuid().parse(params.city);
    const inventoryId = z.string().uuid().parse(params.inventory);

    await UserService.findUserInventory(inventoryId, session);

    const formData = await req.formData();
    const file = formData?.get("file") as unknown as File;
    const useAIInterpretationPath = formData?.get("pathB") === "true";

    if (!file) {
      throw new createHttpError.BadRequest(
        "File not found. Please provide a file to upload.",
      );
    }

    const basicValidation = FileValidatorService.validateFile(file);
    if (!basicValidation.isValid || !basicValidation.fileType) {
      throw new createHttpError.BadRequest(
        basicValidation.errors?.length ? basicValidation.errors.join(", ") : "File validation failed",
      );
    }

    const isPdf = basicValidation.fileType === "pdf";
    const isTabular = basicValidation.fileType === "xlsx" || basicValidation.fileType === "csv";

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const originalFileName = file.name;
    const fileName = `${randomUUID()}-${originalFileName}`;

    if (isPdf) {
      const importedFile = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: session.user.id,
        cityId,
        inventoryId,
        fileName,
        fileType: basicValidation.fileType,
        fileSize: basicValidation.fileSize!,
        data: buffer,
        originalFileName,
        importStatus: ImportStatusEnum.PENDING_AI_EXTRACTION,
        validationResults: { errors: basicValidation.errors, warnings: basicValidation.warnings },
      });
      logger.info({ importedFileId: importedFile.id }, "PDF uploaded, pending AI extraction");
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
          created: importedFile.created,
          lastUpdated: importedFile.lastUpdated,
        },
      });
    }

    if (isTabular) {
      const importedFile = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: session.user.id,
        cityId,
        inventoryId,
        fileName,
        fileType: basicValidation.fileType,
        fileSize: basicValidation.fileSize!,
        data: buffer,
        originalFileName,
        importStatus: ImportStatusEnum.PROCESSING,
        validationResults: null,
      });
      runUploadProcessingInBackground(cityId, inventoryId, importedFile.id).catch((err) =>
        logger.error({ err, importedFileId: importedFile.id }, "Upload background failed"),
      );
      return NextResponse.json(
        {
          data: {
            accepted: true,
            id: importedFile.id,
            message: "Upload accepted; poll GET import status until importStatus is pending_ai_interpretation, waiting_for_approval, or failed.",
          },
        },
        { status: 202 },
      );
    }

    throw new createHttpError.BadRequest("Unsupported file type");
  },
);
