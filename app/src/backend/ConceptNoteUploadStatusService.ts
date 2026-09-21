import { loadConceptNoteUpload } from "@/backend/ConceptNoteUploadService";
import {
  getConceptNotePdfOcrJob,
  normalizeConceptNotePdfOcrStatus,
} from "@/backend/PdfOcrService";
import type { ConceptNoteUploadResponse } from "@/util/types";

/** Return the authoritative upload state across CA persistence and the OCR worker. */
export async function loadConceptNoteUploadStatus(args: {
  runId: string;
  uploadId: string;
  userId: string;
  requestId?: string;
}): Promise<ConceptNoteUploadResponse> {
  const upload = await loadConceptNoteUpload(args);
  const job = await getConceptNotePdfOcrJob(args.uploadId);
  const workerState = job ? normalizeConceptNotePdfOcrStatus(job) : null;
  const completed = upload.status === "ready";
  const status = completed ? "ready" : workerState?.status || upload.status;
  const stage = completed ? "complete" : workerState?.stage || "upload";
  const canRetry = status === "failed" && Boolean(workerState?.canRetry);
  const retryKind = canRetry ? workerState?.retryKind : undefined;
  const errorCode =
    status === "failed"
      ? workerState?.errorCode || upload.errorCode || undefined
      : undefined;

  return {
    uploadId: upload.uploadId,
    runId: upload.runId,
    status,
    stage,
    canRetry,
    ...(retryKind ? { retryKind } : {}),
    filename: upload.filename,
    sourceLabel: upload.sourceLabel || null,
    pageCount: upload.pageCount || null,
    ...(errorCode ? { errorCode } : {}),
    receivedAt: upload.receivedAt,
    completedAt: upload.completedAt || null,
  };
}
