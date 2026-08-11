/**
 * @swagger
 * /api/v1/concept-notes/{runId}/uploads:
 *   post:
 *     operationId: createConceptNoteUpload
 *     summary: Register and queue an authorized Concept Note PDF upload
 *     description: Each accepted request receives a new UUID v4 upload identity before conversion is queued.
 *     tags:
 *       - concept-notes
 *     parameters:
 *       - in: path
 *         name: runId
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
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               sourceLabel:
 *                 type: string
 *                 maxLength: 255
 *                 nullable: true
 *     responses:
 *       202:
 *         description: Upload registered and conversion queued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [uploadId, status, stage, canRetry]
 *               properties:
 *                 uploadId:
 *                   type: string
 *                   format: uuid
 *                 status:
 *                   type: string
 *                   enum: [queued, processing, ready, failed]
 *                 stage:
 *                   type: string
 *                   enum: [ocr, delivery, complete]
 *                 canRetry:
 *                   type: boolean
 *                 retryKind:
 *                   type: string
 *                   enum: [ocr, delivery]
 *       400:
 *         description: Invalid multipart request
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City or run access denied
 *       413:
 *         description: PDF exceeds the 20 MiB limit
 *       415:
 *         description: Only PDF uploads are accepted
 *       422:
 *         description: Invalid filename, label, empty file, or PDF signature
 *       502:
 *         description: Climate Advisor returned an invalid upload identity
 *       503:
 *         description: Source storage or OCR queueing is unavailable
 */
import { randomUUID } from "node:crypto";

import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  loadConceptNoteRunCity,
  updateConceptNoteUpload,
} from "@/backend/ConceptNoteUploadService";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import {
  conceptNotePdfSourceKey,
  enqueueConceptNotePdfOcr,
  normalizeConceptNotePdfOcrStatus,
} from "@/backend/PdfOcrService";
import {
  callConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import { INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES } from "@/backend/inventory-import-file-limits";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ runId: z.string().uuid() });
const createResponseWireSchema = z
  .object({
    upload_id: z.string().uuid(),
    status: z.enum(["queued", "processing", "ready", "failed"]),
  })
  .transform((payload) => ({
    uploadId: payload.upload_id,
    status: payload.status,
  }));

function requestId(req: Request): string | undefined {
  return req.headers.get("x-request-id")?.trim() || undefined;
}

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId } = paramsSchema.parse(params);
  const userId = session.user.id;
  const currentRequestId = requestId(req);

  // Authenticate the run and city before consuming the multipart file body.
  const cityId = await loadConceptNoteRunCity({
    runId,
    userId,
    requestId: currentRequestId,
  });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    throw new createHttpError.BadRequest("Invalid multipart upload");
  }
  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    throw new createHttpError.BadRequest("A PDF file is required");
  }
  const filename = fileEntry.name.trim();
  if (!filename || filename.length > 255) {
    throw new createHttpError.UnprocessableEntity("Invalid PDF filename");
  }
  if (
    fileEntry.type !== "application/pdf" ||
    !filename.toLowerCase().endsWith(".pdf")
  ) {
    throw new createHttpError.UnsupportedMediaType(
      "Only application/pdf uploads are accepted",
    );
  }
  if (fileEntry.size === 0) {
    throw new createHttpError.UnprocessableEntity("PDF file is empty");
  }
  if (fileEntry.size > INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES) {
    throw new createHttpError.PayloadTooLarge(
      "PDF exceeds the 20 MiB upload limit",
    );
  }
  const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());
  if (fileBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new createHttpError.UnprocessableEntity(
      "Uploaded file does not have a valid PDF signature",
    );
  }
  const sourceLabelEntry = formData.get("sourceLabel");
  const sourceLabel =
    typeof sourceLabelEntry === "string" && sourceLabelEntry.trim()
      ? sourceLabelEntry.trim()
      : null;
  if (sourceLabel && sourceLabel.length > 255) {
    throw new createHttpError.UnprocessableEntity("Source label is too long");
  }

  const uploadId = randomUUID();
  const createResponse = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/uploads`,
    userId,
    method: "POST",
    requestId: currentRequestId,
    body: {
      upload_id: uploadId,
      user_id: userId,
      filename,
      source_label: sourceLabel,
    },
  });
  const createPayload = await readConceptNoteApiPayload(createResponse);
  if (!createResponse.ok) {
    return NextResponse.json(createPayload, { status: createResponse.status });
  }
  const created = createResponseWireSchema.safeParse(createPayload);
  if (!created.success || created.data.uploadId !== uploadId) {
    await updateConceptNoteUpload({
      runId,
      uploadId,
      userId,
      action: "failed",
      requestId: currentRequestId,
      errorCode: "ca_upload_response_invalid",
    }).catch(() => {});
    throw new createHttpError.BadGateway(
      "Climate Advisor returned an invalid upload identity",
    );
  }

  const sourceKey = conceptNotePdfSourceKey(uploadId);
  let failureCode = "source_storage_failed";
  let job: Awaited<ReturnType<typeof enqueueConceptNotePdfOcr>>;
  try {
    await InventoryFileStorageService.putFile(
      sourceKey,
      fileBuffer,
      "application/pdf",
    );
    failureCode = "ocr_enqueue_failed";
    job = await enqueueConceptNotePdfOcr(uploadId);
  } catch {
    await updateConceptNoteUpload({
      runId,
      uploadId,
      userId,
      action: "failed",
      requestId: currentRequestId,
      errorCode: failureCode,
    }).catch(() => {});
    throw new createHttpError.ServiceUnavailable(
      "PDF conversion could not be queued",
    );
  }

  const state = normalizeConceptNotePdfOcrStatus(job);

  return NextResponse.json(
    {
      uploadId,
      status: state.status,
      stage: state.stage,
      canRetry: state.canRetry,
      ...(state.retryKind ? { retryKind: state.retryKind } : {}),
    },
    { status: 202 },
  );
});
