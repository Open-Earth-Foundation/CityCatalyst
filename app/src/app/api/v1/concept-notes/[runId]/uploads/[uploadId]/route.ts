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
  const status =
    upload.status === "ready" ? "ready" : workerState?.status || upload.status;
  const errorCode =
    status === "failed"
      ? workerState?.errorCode || upload.error_code || undefined
      : undefined;

  return NextResponse.json({
    upload_id: upload.upload_id,
    run_id: upload.run_id,
    status,
    filename: upload.filename,
    source_label: upload.source_label || null,
    page_count: upload.page_count || null,
    ...(errorCode ? { error_code: errorCode } : {}),
    received_at: upload.received_at,
    completed_at: upload.completed_at || null,
  });
});
