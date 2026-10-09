/**
 * @swagger
 * /api/v1/city/{city}/inventory/{inventory}/import/{importedFileId}/row-preview:
 *   post:
 *     tags:
 *       - city
 *       - inventory
 *       - import
 *     operationId: previewInventoryImportRows
 *     summary: Preview which uploaded rows will be skipped or not counted on import.
 *     description: |
 *       Builds the import rows exactly as approval would, applying the given
 *       mapping overrides, and returns every row that will be skipped (with a
 *       reason code) or imported without counting toward completion because the
 *       inventory type does not require it. Nothing is written.
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
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mappingOverrides:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Same shape as the approve endpoint's mappingOverrides.
 *     responses:
 *       200:
 *         description: Row outcomes for rows that will not be imported as counted data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalRows:
 *                       type: integer
 *                     importedRows:
 *                       type: integer
 *                     skippedRows:
 *                       type: integer
 *                     rows:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           rowNumber:
 *                             type: integer
 *                           gpcRefNo:
 *                             type: string
 *                             nullable: true
 *                           sourceLabel:
 *                             type: string
 *                             nullable: true
 *                           notationKey:
 *                             type: string
 *                             nullable: true
 *                           status:
 *                             type: string
 *                             enum: [skipped, not-counted]
 *                           issue:
 *                             type: string
 *                             enum:
 *                               - missing-gpc-reference
 *                               - gpc-reference-unresolved
 *                               - gpc-reference-unknown
 *                               - unknown-notation-key
 *                               - no-value-or-notation-key
 *                               - invalid-row
 *                               - outside-inventory-type
 *       400:
 *         description: File is not waiting for approval.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Import file not found or access denied.
 */

import UserService from "@/backend/UserService";
import { buildImportResult } from "@/backend/ImportResultBuilder";
import { previewImportRows } from "@/backend/ImportRowPreviewService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { ImportStatusEnum } from "@/util/enums";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

const rowPreviewSchema = z.object({
  mappingOverrides: z.record(z.any()).optional(),
});

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session) throw new createHttpError.Unauthorized("Not signed in");

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
  if (importedFile.importStatus !== ImportStatusEnum.WAITING_FOR_APPROVAL) {
    throw new createHttpError.BadRequest(
      "Row preview is only available while the import waits for approval",
    );
  }

  const body = rowPreviewSchema.parse(await req.json().catch(() => ({})));
  const { importResult } = await buildImportResult(
    importedFile,
    body.mappingOverrides,
  );
  const preview = await previewImportRows(
    importResult,
    inventory.inventoryType,
  );

  return NextResponse.json({ data: preview });
});
