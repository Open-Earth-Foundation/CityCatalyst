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
  retryConceptNotePdfOcr,
} from "@/backend/PdfOcrService";
import { PermissionService } from "@/backend/permissions/PermissionService";
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
  if (!job) {
    throw new createHttpError.Conflict("PDF conversion job is unavailable");
  }
  if (upload.status === "ready" || job.deliveryStatus === "delivered") {
    throw new createHttpError.Conflict("A completed upload cannot be retried");
  }

  await updateConceptNoteUpload({
    runId,
    uploadId,
    userId,
    action: "retry",
    requestId: currentRequestId,
  });
  const retryKind = await retryConceptNotePdfOcr(job);
  return NextResponse.json(
    {
      upload_id: uploadId,
      status: retryKind === "delivery" ? "processing" : "queued",
    },
    { status: 202 },
  );
});
