/**
 * @swagger
 * /api/v1/city/{city}/inventory/{inventory}/import/{importedFileId}/extract:
 *   post:
 *     tags:
 *       - city
 *       - inventory
 *       - import
 *     operationId: extractInventoryFromPdf
 *     summary: Queue durable OCR and AI extraction for an uploaded PDF.
 *     description: |
 *       Returns 202 Accepted after creating or reusing a durable PDF OCR job.
 *       A deployment-managed scheduler performs Mistral OCR and downstream row extraction.
 *       Poll GET .../import/{importedFileId} until importStatus is
 *       waiting_for_approval or failed. PDF sources must be stored in S3.
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
 *               sourceMetadata:
 *                 type: object
 *                 description: |
 *                   What the user knows about the source document. Every key is
 *                   optional. numberFormat needs numberFormatSource, and
 *                   reportedTotal needs reportedTotalKind.
 *                 properties:
 *                   numberFormat:
 *                     type: string
 *                     enum: [european, english]
 *                     nullable: true
 *                   numberFormatSource:
 *                     type: string
 *                     enum: [user, country_default]
 *                     nullable: true
 *                   reportedTotal:
 *                     type: number
 *                     nullable: true
 *                   reportedTotalKind:
 *                     type: string
 *                     enum: [gross, net]
 *                     nullable: true
 *     responses:
 *       202:
 *         description: Extraction queued; poll the import resource for completion.
 *       400:
 *         description: File is not a PDF, is not ready for extraction, or sourceMetadata is invalid.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Import file not found or access denied.
 *       503:
 *         description: PDF OCR storage is not configured.
 */

import UserService from "@/backend/UserService";
import { enqueueInventoryPdfOcr } from "@/backend/PdfOcrService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { ImportStatusEnum } from "@/util/enums";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  sourceMetadataSchema,
  type SourceMetadata,
} from "@/util/GHGI/source-metadata";

/** Reads the optional JSON body; no body or a non-JSON content type gives none. */
async function readSourceMetadata(
  req: Request,
): Promise<SourceMetadata | undefined> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return undefined;
  }
  const text = await req.text();
  if (!text.trim()) return undefined;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new createHttpError.BadRequest("Invalid JSON body");
  }
  const raw = (body as { sourceMetadata?: unknown } | null)?.sourceMetadata;
  if (raw === undefined) return undefined;
  const parsed = sourceMetadataSchema.safeParse(raw);
  if (!parsed.success) {
    throw new createHttpError.BadRequest(
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  return parsed.data;
}

/** Queue-only endpoint; a deployment-managed scheduler triggers processing. */
export const maxDuration = 30;

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session) throw new createHttpError.Unauthorized("Not signed in");

  const cityId = z.string().uuid().parse(params.city);
  const inventoryId = z.string().uuid().parse(params.inventory);
  const importedFileId = z.string().uuid().parse(params.importedFileId);
  await UserService.findUserInventory(inventoryId, session);
  const sourceMetadata = await readSourceMetadata(req);

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

  const existingJob = await db.models.PdfOcrJob.findOne({
    where: { sourceType: "inventory_import", sourceId: importedFile.id },
  });
  const mayResumeStoredMarkdown =
    importedFile.importStatus === ImportStatusEnum.FAILED &&
    existingJob?.status === "succeeded";
  if (
    importedFile.importStatus !== ImportStatusEnum.PENDING_AI_EXTRACTION &&
    importedFile.importStatus !== ImportStatusEnum.EXTRACTING &&
    !mayResumeStoredMarkdown
  ) {
    throw new createHttpError.BadRequest(
      "File is not ready for PDF extraction",
    );
  }
  if (!importedFile.s3Key) {
    throw new createHttpError.ServiceUnavailable(
      "PDF OCR requires S3-backed file storage; please re-upload after S3 is configured",
    );
  }

  // Each extract call states the metadata for this run: no body, an empty body
  // or a non-JSON body clears metadata stored by an earlier call.
  const { sourceMetadata: _stale, ...mappingConfiguration } =
    importedFile.mappingConfiguration || {};
  if (sourceMetadata || _stale !== undefined) {
    await importedFile.update({
      mappingConfiguration: sourceMetadata
        ? { ...mappingConfiguration, sourceMetadata }
        : mappingConfiguration,
    });
  }
  await enqueueInventoryPdfOcr(importedFile);
  return NextResponse.json(
    {
      data: {
        accepted: true,
        id: importedFileId,
        message:
          "Extraction queued; poll GET import status until importStatus is waiting_for_approval or failed.",
      },
    },
    { status: 202 },
  );
});
