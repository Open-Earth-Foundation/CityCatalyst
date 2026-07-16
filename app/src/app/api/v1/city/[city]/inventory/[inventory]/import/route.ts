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
import FormatAdapterService from "@/backend/FormatAdapterService";
import InventoryFileStorageService, {
  isS3Configured,
} from "@/backend/InventoryFileStorageService";
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
  if (
    !importedFile ||
    importedFile.importStatus !== ImportStatusEnum.PROCESSING
  ) {
    logger.warn(
      { importedFileId, inventoryId, cityId },
      "Upload background: file not found or not PROCESSING",
    );
    return;
  }

  const originalFileName =
    (importedFile.originalFileName as string) || "upload";
  const fileType = importedFile.fileType as "xlsx" | "csv";

  let buffer: Buffer;
  if (importedFile.s3Key) {
    try {
      buffer = await InventoryFileStorageService.getFileBuffer(
        importedFile.s3Key,
      );
    } catch (err) {
      logger.error(
        { err, importedFileId, s3Key: importedFile.s3Key },
        "Upload background: failed to fetch file from S3",
      );
      await importedFile.update({
        importStatus: ImportStatusEnum.FAILED,
        errorLog: "Could not retrieve uploaded file from storage.",
        lastUpdated: new Date(),
      });
      return;
    }
  } else if (importedFile.data && Buffer.isBuffer(importedFile.data)) {
    buffer = importedFile.data as Buffer;
  } else {
    logger.error(
      { importedFileId },
      "Upload background: neither s3Key nor data buffer found on importedFile",
    );
    await importedFile.update({
      importStatus: ImportStatusEnum.FAILED,
      errorLog: "File reference missing; please re-upload.",
      lastUpdated: new Date(),
    });
    return;
  }

  const file = new File([new Uint8Array(buffer)], originalFileName, {
    type: InventoryFileStorageService.mimeTypeForFileType(fileType),
  });

  const setFailed = async (message: string) => {
    await importedFile.update({
      importStatus: ImportStatusEnum.FAILED,
      errorLog: message,
      lastUpdated: new Date(),
    });
  };

  try {
    const validationResult =
      await FileValidatorService.validateFileStructure(file);
    const isTabular =
      validationResult.fileType === "xlsx" ||
      validationResult.fileType === "csv";
    if (!isTabular) {
      await setFailed(
        validationResult.errors?.length
          ? validationResult.errors.join("; ")
          : "File validation failed",
      );
      return;
    }

    // ── Adapter D (near-ecrf): direct deterministic mapping, no AI needed ──
    if (validationResult.adapterType === "near-ecrf") {
      const parsedData = await FileParserService.parseFile(buffer, fileType);
      // Fetch target year from the inventory so rows get annotated with the correct year
      const inventory = await db.models.Inventory.findOne({
        where: { inventoryId },
        attributes: ["year"],
      });
      const targetYear =
        inventory?.year != null && Number.isInteger(Number(inventory.year))
          ? Number(inventory.year)
          : undefined;
      const rows = FormatAdapterService.toExtractedRows(parsedData, targetYear);
      if (rows.length === 0) {
        await setFailed(
          "Adapter D: no data rows could be extracted from this file",
        );
        return;
      }
      await importedFile.update({
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        validationResults: {
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          detectedColumns: validationResult.detectedColumns,
          adapterType: "near-ecrf",
          isMultiCity: validationResult.isMultiCity ?? false,
          headerKey: validationResult.headerKey,
        },
        rowCount: rows.length,
        mappingConfiguration: { rows },
        lastUpdated: new Date(),
      });
      logger.info(
        { importedFileId: importedFile.id, rowCount: rows.length },
        "Adapter D (near-ecrf): direct mapping completed, waiting for approval",
      );
      return;
    }

    // ── Adapters A/B/C: normalize, then hand off to AI interpretation (Path B) ──
    const usePathB =
      !!validationResult.adapterType ||
      !FileValidatorService.hasDistinctRequiredECRFColumns(
        validationResult.detectedColumns || {},
      ) ||
      !!validationResult.isCIRIS ||
      !!validationResult.isBIOMATEC;

    // Path B: file doesn't have full eCRF structure, is CIRIS, BIOMATEC, or matched an adapter.
    if (usePathB) {
      await importedFile.update({
        importStatus: ImportStatusEnum.PENDING_AI_INTERPRETATION,
        validationResults: {
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          detectedColumns: validationResult.detectedColumns,
          isCIRIS: validationResult.isCIRIS ?? false,
          isBIOMATEC: validationResult.isBIOMATEC ?? false,
          adapterType: validationResult.adapterType,
          isMultiCity: validationResult.isMultiCity ?? false,
          headerKey: validationResult.headerKey,
        },
        lastUpdated: new Date(),
      });
      logger.info(
        {
          importedFileId: importedFile.id,
          adapterType: validationResult.adapterType,
          isCIRIS: validationResult.isCIRIS,
          isBIOMATEC: validationResult.isBIOMATEC,
        },
        "Tabular upload (Path B) validated, pending AI interpretation",
      );
      return;
    }

    // eCRF path: require valid structure
    if (!validationResult.isValid) {
      await setFailed(
        validationResult.errors?.length
          ? validationResult.errors.join("; ")
          : "File validation failed",
      );
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
        warnings: [
          ...(validationResult.warnings || []),
          ...importResult.warnings,
        ],
        detectedColumns: validationResult.detectedColumns,
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
      { importedFileId: importedFile.id, rowCount: importResult.rowCount },
      "Tabular upload (eCRF) processed, waiting for approval",
    );
  } catch (error) {
    logger.error(
      { err: error, importedFileId: importedFile.id },
      "Upload background processing failed",
    );
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

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      throw new createHttpError.BadRequest(
        `File too large. Maximum allowed size is ${FileValidatorService.MAX_FILE_SIZE_MB}MB. Please reduce the file size and try again.`,
      );
    }
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
        basicValidation.errors?.length
          ? basicValidation.errors.join(", ")
          : "File validation failed",
      );
    }

    const isPdf = basicValidation.fileType === "pdf";
    const isTabular =
      basicValidation.fileType === "xlsx" || basicValidation.fileType === "csv";

    if (isPdf && !isS3Configured()) {
      throw new createHttpError.ServiceUnavailable(
        "PDF uploads require S3-backed storage for OCR",
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const originalFileName = file.name;
    const fileName = `${randomUUID()}-${originalFileName}`;
    const mimeType = InventoryFileStorageService.mimeTypeForFileType(
      basicValidation.fileType as "csv" | "xlsx" | "pdf",
    );

    // Upload to S3 when configured; fall back to BYTEA for local dev.
    let s3Key: string | undefined;
    let dataBuffer: Buffer | undefined;

    if (isS3Configured()) {
      try {
        s3Key = await InventoryFileStorageService.uploadFile(
          buffer,
          cityId,
          inventoryId,
          fileName,
          mimeType,
        );
      } catch (err) {
        logger.error(
          { err, cityId, inventoryId, fileName },
          "Failed to upload file to S3",
        );
        throw new createHttpError.InternalServerError(
          "Failed to store uploaded file. Please try again.",
        );
      }
    } else {
      logger.warn(
        { cityId, inventoryId, fileName },
        "AWS_FILE_UPLOAD_S3_BUCKET_ID not set — storing file as BYTEA (dev fallback)",
      );
      dataBuffer = buffer;
    }

    if (isPdf) {
      const importedFile = await db.models.ImportedInventoryFile.create({
        id: randomUUID(),
        userId: session.user.id,
        cityId,
        inventoryId,
        fileName,
        fileType: basicValidation.fileType,
        fileSize: basicValidation.fileSize!,
        s3Key,
        data: dataBuffer,
        originalFileName,
        importStatus: ImportStatusEnum.PENDING_AI_EXTRACTION,
        validationResults: {
          errors: basicValidation.errors,
          warnings: basicValidation.warnings,
        },
      });
      logger.info(
        {
          importedFileId: importedFile.id,
          storageMode: s3Key ? "s3" : "bytea",
        },
        "PDF uploaded, pending AI extraction",
      );
      return NextResponse.json(
        {
          data: {
            accepted: true,
            id: importedFile.id,
            message:
              "Upload accepted; poll GET import status until importStatus is pending_ai_extraction, pending_ai_interpretation, waiting_for_approval, or failed.",
          },
        },
        { status: 202 },
      );
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
        s3Key,
        data: dataBuffer,
        originalFileName,
        importStatus: ImportStatusEnum.PROCESSING,
        validationResults: null,
      });
      runUploadProcessingInBackground(
        cityId,
        inventoryId,
        importedFile.id,
      ).catch((err) =>
        logger.error(
          { err, importedFileId: importedFile.id },
          "Upload background failed",
        ),
      );
      return NextResponse.json(
        {
          data: {
            accepted: true,
            id: importedFile.id,
            message:
              "Upload accepted; poll GET import status until importStatus is pending_ai_interpretation, waiting_for_approval, or failed.",
          },
        },
        { status: 202 },
      );
    }

    throw new createHttpError.BadRequest("Unsupported file type");
  },
);
