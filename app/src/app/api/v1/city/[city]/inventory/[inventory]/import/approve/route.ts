/**
 * @swagger
 * /api/v1/city/{city}/inventory/{inventory}/import/approve:
 *   post:
 *     tags:
 *       - city
 *       - inventory
 *       - import
 *     operationId: approveInventoryImport
 *     summary: Approve import mappings and trigger processing.
 *     description: Approves the mappings for an imported inventory file and updates the import status. Optionally accepts mapping overrides.
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               importedFileId:
 *                 type: string
 *                 format: uuid
 *               mappingOverrides:
 *                 type: object
 *                 description: Optional mapping overrides for specific rows
 *     responses:
 *       200:
 *         description: Import approved successfully.
 *       400:
 *         description: Invalid request or mappings cannot be approved.
 *       404:
 *         description: Import file not found.
 *       401:
 *         description: Unauthorized.
 */

import UserService from "@/backend/UserService";
import FileParserService from "@/backend/FileParserService";
import ECRFImportService from "@/backend/ECRFImportService";
import InventoryImportService from "@/backend/InventoryImportService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { ImportStatusEnum } from "@/util/enums";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/services/logger";

const approveImportSchema = z.object({
  importedFileId: z.string().uuid(),
  mappingOverrides: z.record(z.any()).optional(),
});

export const POST = apiHandler(
  async (req: NextRequest, { session, params }) => {
    if (!session) {
      throw new createHttpError.Unauthorized("Not signed in");
    }

    const cityId = z.string().uuid().parse(params.city);
    const inventoryId = z.string().uuid().parse(params.inventory);

    // Validate user access to inventory
    await UserService.findUserInventory(inventoryId, session);

    // Parse request body
    const body = await req.json();
    const { importedFileId, mappingOverrides } =
      approveImportSchema.parse(body);

    // Find the imported file
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

    // Validate that the file is in a state that can be approved
    if (importedFile.importStatus !== ImportStatusEnum.WAITING_FOR_APPROVAL) {
      throw new createHttpError.BadRequest(
        `Cannot approve import with status: ${importedFile.importStatus}. Expected status: ${ImportStatusEnum.WAITING_FOR_APPROVAL}`,
      );
    }

    // Update mapping configuration if overrides provided
    let mappingConfiguration = importedFile.mappingConfiguration || {};
    if (mappingOverrides) {
      mappingConfiguration = {
        ...mappingConfiguration,
        overrides: mappingOverrides,
      };
    }

    // Update import status to APPROVED, then process import
    await importedFile.update({
      importStatus: ImportStatusEnum.APPROVED,
      mappingConfiguration,
      lastUpdated: new Date(),
    });

    try {
      // Update status to IMPORTING
      await importedFile.update({
        importStatus: ImportStatusEnum.IMPORTING,
        lastUpdated: new Date(),
      });

      // Process and import the data
      if (!importedFile.data) {
        throw new Error("File data not found");
      }

      const buffer = Buffer.from(importedFile.data as any);
      const parsedData = await FileParserService.parseFile(
        buffer,
        importedFile.fileType,
      );

      const validationResults = importedFile.validationResults as any;
      let detectedColumns: Record<string, number> = {
        ...(validationResults?.detectedColumns || {}),
      };

      // Apply mapping overrides: columnName -> key; resolve column name to index
      if (
        mappingOverrides &&
        Object.keys(mappingOverrides).length > 0 &&
        parsedData.primarySheet
      ) {
        const headers = parsedData.primarySheet.headers;
        for (const [columnName, key] of Object.entries(mappingOverrides)) {
          if (!key) continue;
          const idx = headers.findIndex((h) => h === columnName);
          if (idx !== -1) {
            detectedColumns[key] = idx;
          }
        }
      }

      const importResult = await ECRFImportService.processECRFFile(
        parsedData,
        detectedColumns,
      );

      // Import data into inventory
      const importSummary = await InventoryImportService.importECRFData(
        inventoryId,
        importResult,
      );

      // Update status to COMPLETED
      await importedFile.update({
        importStatus: ImportStatusEnum.COMPLETED,
        processedRowCount: importSummary.importedRows,
        completedAt: new Date(),
        lastUpdated: new Date(),
        validationResults: {
          ...validationResults,
          importSummary,
        },
      });

      logger.info(
        {
          importedFileId: importedFile.id,
          inventoryId,
          importedRows: importSummary.importedRows,
        },
        "Import completed successfully",
      );
    } catch (error) {
      // Mark as failed if import process fails
      await importedFile.update({
        importStatus: ImportStatusEnum.FAILED,
        errorLog: error instanceof Error ? error.message : "Unknown error",
        lastUpdated: new Date(),
      });

      logger.error(
        { err: error, importedFileId: importedFile.id },
        "Failed to import data into inventory",
      );

      throw new createHttpError.InternalServerError(
        `Failed to import data: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    // Reload to get updated status
    await importedFile.reload();

    // Return updated file metadata
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
