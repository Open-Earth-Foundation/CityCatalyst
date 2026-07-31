/**
 * @swagger
 * /api/v1/concept-notes/{runId}/uploads/{uploadId}:
 *   get:
 *     operationId: getConceptNoteUploadStatus
 *     summary: Get the authorized lifecycle status of a Concept Note PDF upload
 *     description: Reports whether failure occurred during upload registration, OCR, or pointer delivery and whether retry is supported.
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
 *       200:
 *         description: Upload lifecycle status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - upload_id
 *                 - run_id
 *                 - status
 *                 - stage
 *                 - can_retry
 *                 - filename
 *                 - received_at
 *               properties:
 *                 upload_id:
 *                   type: string
 *                   format: uuid
 *                 run_id:
 *                   type: string
 *                   format: uuid
 *                 status:
 *                   type: string
 *                   enum: [queued, processing, ready, failed]
 *                 stage:
 *                   type: string
 *                   enum: [upload, ocr, delivery, complete]
 *                 can_retry:
 *                   type: boolean
 *                 retry_kind:
 *                   type: string
 *                   enum: [ocr, delivery]
 *                 filename:
 *                   type: string
 *                 source_label:
 *                   type: string
 *                   nullable: true
 *                 page_count:
 *                   type: integer
 *                   nullable: true
 *                 error_code:
 *                   type: string
 *                 received_at:
 *                   type: string
 *                   format: date-time
 *                 completed_at:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City or run access denied
 *       404:
 *         description: Run or upload not found
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  loadConceptNoteRunCity,
  loadConceptNoteUpload,
} from "@/backend/ConceptNoteUploadService";
import {
  getConceptNotePdfOcrJob,
  normalizeConceptNotePdfOcrStatus,
} from "@/backend/PdfOcrService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({
  runId: z.string().uuid(),
  uploadId: z.string().uuid(),
});

export const GET = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId, uploadId } = paramsSchema.parse(params);
  const userId = session.user.id;
  const currentRequestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({
    runId,
    userId,
    requestId: currentRequestId,
  });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });
  const upload = await loadConceptNoteUpload({
    runId,
    uploadId,
    userId,
    requestId: currentRequestId,
  });
  const job = await getConceptNotePdfOcrJob(uploadId);
  const workerState = job ? normalizeConceptNotePdfOcrStatus(job) : null;
  const completed = upload.status === "ready";
  const status = completed ? "ready" : workerState?.status || upload.status;
  const stage = completed ? "complete" : workerState?.stage || "upload";
  const canRetry = status === "failed" && Boolean(workerState?.canRetry);
  const retryKind = canRetry ? workerState?.retryKind : undefined;
  const errorCode =
    status === "failed"
      ? workerState?.errorCode || upload.error_code || undefined
      : undefined;

  return NextResponse.json({
    upload_id: upload.upload_id,
    run_id: upload.run_id,
    status,
    stage,
    can_retry: canRetry,
    ...(retryKind ? { retry_kind: retryKind } : {}),
    filename: upload.filename,
    source_label: upload.source_label || null,
    page_count: upload.page_count || null,
    ...(errorCode ? { error_code: errorCode } : {}),
    received_at: upload.received_at,
    completed_at: upload.completed_at || null,
  });
});
