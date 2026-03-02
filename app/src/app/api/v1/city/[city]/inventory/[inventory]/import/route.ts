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
    const pathB = formData?.get("pathB") === "true";

    if (!file) {
      throw new createHttpError.BadRequest(
        "File not found. Please provide a file to upload.",
      );
    }

    // Path selection for tabular (xlsx/csv): only use eCRF path when file has full eCRF structure (all required columns).
    // Otherwise use Path B (Interpret with AI). pathB form flag forces Path B without running structure check.
    let validationResult = pathB
      ? FileValidatorService.validateFile(file)
      : await FileValidatorService.validateFileStructure(file);

    let usePathB = pathB;
    const isTabular =
      validationResult.fileType === "xlsx" || validationResult.fileType === "csv";
    if (!pathB && isTabular && !validationResult.isValid) {
      // Tabular file does not have full eCRF structure → use Path B only (do not use eCRF path)
      logger.info(
        { errors: validationResult.errors },
        "Tabular file does not have eCRF structure; using Path B (Interpret with AI)",
      );
      validationResult = FileValidatorService.validateFile(file);
      usePathB = validationResult.isValid;
    } else if (
      !pathB &&
      isTabular &&
      validationResult.isValid &&
      !FileValidatorService.hasDistinctRequiredECRFColumns(
        validationResult.detectedColumns,
      )
    ) {
      // Structure passed but required identity columns collapse into one (e.g. single "Sector and scope (GPC ref)") → Path B
      logger.info(
        { detectedColumns: validationResult.detectedColumns },
        "Tabular file required columns not distinct; using Path B (Interpret with AI)",
      );
      validationResult = FileValidatorService.validateFile(file);
      usePathB = validationResult.isValid;
    } else if (!pathB && isTabular && validationResult.isValid && validationResult.isCIRIS) {
      // CIRIS (CDP) format: has eCRF_3 sheet but should use AI extraction from it, not standard eCRF path
      logger.info(
        "CIRIS (CDP) format detected; using Path B (Interpret with AI) for eCRF_3 sheet",
      );
      validationResult = FileValidatorService.validateFile(file);
      usePathB = validationResult.isValid;
    }

    if (!validationResult.isValid) {
      throw new createHttpError.BadRequest(
        `File validation failed: ${validationResult.errors.join(", ")}`,
      );
    }

    // Path B only accepts xlsx/csv
    if (usePathB && validationResult.fileType !== "xlsx" && validationResult.fileType !== "csv") {
      throw new createHttpError.BadRequest(
        "Path B (Interpret with AI) accepts only xlsx or csv files.",
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate sanitized file name (for now, just use the original with UUID prefix)
    const originalFileName = file.name;
    const fileName = `${randomUUID()}-${originalFileName}`;

    const isPdf = validationResult.fileType === "pdf";

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
      importStatus: isPdf
        ? ImportStatusEnum.PENDING_AI_EXTRACTION
        : usePathB
          ? ImportStatusEnum.PENDING_AI_INTERPRETATION
          : ImportStatusEnum.PROCESSING,
      validationResults: {
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        detectedColumns: validationResult.detectedColumns,
      },
    });

    // Path C (PDF): stop here; user will call Extract API to run AI extraction
    if (isPdf) {
      logger.info(
        { importedFileId: importedFile.id },
        "PDF uploaded, pending AI extraction",
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
          created: importedFile.created,
          lastUpdated: importedFile.lastUpdated,
        },
      });
    }

    // Path B (tabular): stop here; user will call Interpret API to run AI column mapping
    if (usePathB) {
      logger.info(
        { importedFileId: importedFile.id },
        "Tabular file uploaded (Path B), pending AI interpretation",
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
          created: importedFile.created,
          lastUpdated: importedFile.lastUpdated,
        },
      });
    }

    try {
      // Process the file: parse and extract eCRF data (xlsx/csv only)
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
