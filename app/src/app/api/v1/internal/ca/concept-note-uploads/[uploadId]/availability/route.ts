/**
 * @swagger
 * /api/v1/internal/ca/concept-note-uploads/{uploadId}/availability:
 *   get:
 *     operationId: verifyDocumentWorkspaceSource
 *     summary: Check current source lifecycle and immutable Markdown identity
 *     tags: [concept-notes-internal]
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Source remains available with the current artifact digest }
 *       409: { description: Source was withdrawn, superseded, removed or changed }
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClimateAdvisorServiceRequest } from "@/backend/agentic/ghgi/stationary-energy/auth";
import { assertReusedDocumentSourceAvailable } from "@/backend/document-workspace-sources";
import { getConceptNotePdfOcrJob } from "@/backend/PdfOcrService";
import { apiHandler } from "@/util/api";

export const GET = apiHandler(async (request, { session, params }) => {
  requireClimateAdvisorServiceRequest(request);
  if (!session?.user?.id)
    throw new createHttpError.Unauthorized("Authentication required");
  const uploadId = z.string().uuid().parse(params.uploadId);
  await assertReusedDocumentSourceAvailable(uploadId, session);
  const job = await getConceptNotePdfOcrJob(uploadId);
  if (!job || job.status !== "succeeded" || !job.resultSha256)
    throw new createHttpError.Conflict("Document source is not ready");
  return NextResponse.json(
    { available: true, markdown_sha256: job.resultSha256 },
    {
      headers: { "Cache-Control": "private, no-store" },
    },
  );
});
