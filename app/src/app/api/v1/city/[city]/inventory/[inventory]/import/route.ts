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

export const POST = apiHandler(
  async (req: NextRequest, { session, params }) => {
    if (!session) {
      throw new createHttpError.Unauthorized("Not signed in");
    }

    const cityId = z.string().uuid().parse(params.city);
    const inventoryId = z.string().uuid().parse(params.inventory);

    // Validate user access to inventory
    await UserService.findUserInventory(inventoryId, session);

    // Get form data
    const formData = await req.formData();
    const file = formData?.get("file") as unknown as File;

    if (!file) {
      throw new createHttpError.BadRequest(
        "File not found. Please provide a file to upload.",
      );
    }

    // Validate file using FileValidatorService (includes structure validation)
    const validationResult =
      await FileValidatorService.validateFileStructure(file);

    if (!validationResult.isValid) {
      throw new createHttpError.BadRequest(
        `File validation failed: ${validationResult.errors.join(", ")}`,
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate sanitized file name (for now, just use the original with UUID prefix)
    // In a real implementation, you might want to sanitize special characters
    const originalFileName = file.name;
    const fileName = `${randomUUID()}-${originalFileName}`;

    // Create ImportedInventoryFile record
    const importedFile = await db.models.ImportedInventoryFile.create({
      id: randomUUID(),
      userId: session.user.id,
      cityId,
      inventoryId,
      fileName,
      fileType: validationResult.fileType!,
      fileSize: validationResult.fileSize!,
      data: buffer,
      originalFileName,
      importStatus: ImportStatusEnum.PROCESSING,
      validationResults: {
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        detectedColumns: validationResult.detectedColumns,
      },
    });

    try {
      // Process the file: parse and extract eCRF data
      const parsedData = await FileParserService.parseFile(
        buffer,
        validationResult.fileType!,
      );

      const importResult = await ECRFImportService.processECRFFile(
        parsedData,
        validationResult.detectedColumns || {},
      );

      // Update file with processing results
      await importedFile.update({
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        validationResults: {
          errors: validationResult.errors,
          warnings: [...validationResult.warnings, ...importResult.warnings],
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
        {
          importedFileId: importedFile.id,
          rowCount: importResult.rowCount,
          validRowCount: importResult.validRowCount,
        },
        "File processed and ready for approval",
      );
    } catch (error) {
      // If processing fails, mark as failed
      await importedFile.update({
        importStatus: ImportStatusEnum.FAILED,
        errorLog: error instanceof Error ? error.message : "Unknown error",
        lastUpdated: new Date(),
      });

      logger.error(
        { err: error, importedFileId: importedFile.id },
        "Failed to process imported file",
      );

      throw new createHttpError.InternalServerError(
        `Failed to process file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    // Reload to get updated status
    await importedFile.reload();

    // Return response with metadata (excluding the binary data)
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
  },
);
