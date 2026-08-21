/**
 * @swagger
 * /api/v1/concept-notes/{runId}/uploads/{uploadId}/retry:
 *   post:
 *     operationId: retryConceptNoteUpload
 *     summary: Retry failed Concept Note OCR or Markdown-pointer delivery
 *     description: Failed OCR reruns conversion; delivery retry reuses successful OCR without calling Mistral again.
 *     tags:
 *       - concept-notes
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       202:
 *         description: Retry accepted or an identical retry is already in progress
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [uploadId, status, stage]
 *               properties:
 *                 uploadId:
 *                   type: string
 *                   format: uuid
 *                 status:
 *                   type: string
 *                   enum: [queued, processing]
 *                 stage:
 *                   type: string
 *                   enum: [ocr, delivery]
 *                 retryKind:
 *                   type: string
 *                   enum: [ocr, delivery]
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City or run access denied
 *       404:
 *         description: Run or upload not found
 *       409:
 *         description: The upload has completed or its CC OCR job is unavailable
 */
import { randomUUID } from "node:crypto";

import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  loadConceptNoteRunCity,
  loadConceptNoteUpload,
  updateConceptNoteUpload,
} from "@/backend/ConceptNoteUploadService";
import {
  getConceptNotePdfOcrJob,
  normalizeConceptNotePdfOcrStatus,
  retryConceptNotePdfOcr,
} from "@/backend/PdfOcrService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({
  runId: z.string().uuid(),
  uploadId: z.string().uuid(),
});

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId, uploadId } = paramsSchema.parse(params);
  const userId = session.user.id;
  const requestId =
    req.headers.get("x-request-id")?.trim() || `cc-${randomUUID()}`;
  const cityId = await loadConceptNoteRunCity({
    runId,
    userId,
    requestId,
  });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });
  const upload = await loadConceptNoteUpload({
    runId,
    uploadId,
    userId,
    requestId,
  });
  const job = await getConceptNotePdfOcrJob(uploadId);
  if (!job) {
    throw new createHttpError.Conflict("PDF conversion job is unavailable");
  }
  const currentState = normalizeConceptNotePdfOcrStatus(job);
  if (upload.status === "ready" || currentState.status === "ready") {
    throw new createHttpError.Conflict("A completed upload cannot be retried");
  }

  await updateConceptNoteUpload({
    runId,
    uploadId,
    userId,
    action: "retry",
    requestId,
  });
  const retryKind = await retryConceptNotePdfOcr(job);
  const acceptedKind =
    retryKind === "noop" ? currentState.retryKind : retryKind;
  logger.info(
    {
      requestId,
      userId,
      runId,
      uploadId,
      retryKind,
      acceptedRetryKind: acceptedKind,
    },
    "Concept Note upload retry processed",
  );
  const status =
    retryKind === "ocr"
      ? "queued"
      : retryKind === "delivery"
        ? "processing"
        : currentState.status;
  const stage =
    acceptedKind ||
    (currentState.stage === "complete" ? "delivery" : currentState.stage);
  return NextResponse.json(
    {
      uploadId,
      status,
      stage,
      ...(acceptedKind ? { retryKind: acceptedKind } : {}),
    },
    { status: 202 },
  );
});
