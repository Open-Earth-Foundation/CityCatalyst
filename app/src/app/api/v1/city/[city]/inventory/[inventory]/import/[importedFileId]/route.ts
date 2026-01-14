/**
 * @swagger
 * /api/v1/city/{city}/inventory/{inventory}/import/{importedFileId}:
 *   get:
 *     tags:
 *       - city
 *       - inventory
 *       - import
 *     operationId: getInventoryImportStatus
 *     summary: Get import status and mappings for approval.
 *     description: Retrieves the import status, validation results, and mapping configuration for an imported inventory file. Used to display mappings to the user before approval.
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
 *         description: Import file status and mappings.
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
 *                     importStatus:
 *                       type: string
 *                       enum: [uploaded, processing, waiting_for_approval, approved, importing, completed, failed]
 *                     fileName:
 *                       type: string
 *                     originalFileName:
 *                       type: string
 *                     fileType:
 *                       type: string
 *                       enum: [xlsx, csv]
 *                     fileSize:
 *                       type: integer
 *                     rowCount:
 *                       type: integer
 *                     processedRowCount:
 *                       type: integer
 *                     validationResults:
 *                       type: object
 *                       properties:
 *                         errors:
 *                           type: array
 *                           items:
 *                             type: string
 *                         warnings:
 *                           type: array
 *                           items:
 *                             type: string
 *                         detectedColumns:
 *                           type: object
 *                         processingResults:
 *                           type: object
 *                     mappingConfiguration:
 *                       type: object
 *                       properties:
 *                         rows:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               gpcRefNo:
 *                                 type: string
 *                               sectorId:
 *                                 type: string
 *                               subsectorId:
 *                                 type: string
 *                               subcategoryId:
 *                                 type: string
 *                               scopeId:
 *                                 type: string
 *                               hasErrors:
 *                                 type: boolean
 *                               hasWarnings:
 *                                 type: boolean
 *                     errorLog:
 *                       type: string
 *                       nullable: true
 *                     created:
 *                       type: string
 *                       format: date-time
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *                     completedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       404:
 *         description: Import file not found.
 *       401:
 *         description: Unauthorized.
 */

import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const GET = apiHandler(
  async (req: NextRequest, { session, params }) => {
    if (!session) {
      throw new createHttpError.Unauthorized("Not signed in");
    }

    const cityId = z.string().uuid().parse(params.city);
    const inventoryId = z.string().uuid().parse(params.inventory);
    const importedFileId = z.string().uuid().parse(params.importedFileId);

    // Validate user access to inventory
    await UserService.findUserInventory(inventoryId, session);

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

    // Return response with status and mappings (excluding the binary data)
    return NextResponse.json({
      data: {
        id: importedFile.id,
        importStatus: importedFile.importStatus,
        fileName: importedFile.fileName,
        originalFileName: importedFile.originalFileName,
        fileType: importedFile.fileType,
        fileSize: importedFile.fileSize,
        rowCount: importedFile.rowCount,
        processedRowCount: importedFile.processedRowCount,
        validationResults: importedFile.validationResults,
        mappingConfiguration: importedFile.mappingConfiguration,
        errorLog: importedFile.errorLog,
        created: importedFile.created,
        lastUpdated: importedFile.lastUpdated,
        completedAt: importedFile.completedAt,
      },
    });
  },
);

