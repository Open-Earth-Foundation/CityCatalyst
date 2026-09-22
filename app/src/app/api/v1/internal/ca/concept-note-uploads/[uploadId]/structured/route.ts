/**
 * @swagger
 * /api/v1/internal/ca/concept-note-uploads/{uploadId}/structured:
 *   get:
 *     operationId: getConceptNoteUploadStructured
 *     summary: Read a verified CC-owned structured PDF artifact for Climate Advisor
 *     description: Requires Climate Advisor service authentication plus the CC-issued user bearer token. CA never receives S3 credentials or a signed URL. The response is the immutable document.structured.json object.
 *     tags:
 *       - concept-notes-internal
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Verified structured JSON returned by CityCatalyst
 *         headers:
 *           X-Structured-S3-Key:
 *             schema:
 *               type: string
 *           X-Structured-SHA256:
 *             schema:
 *               type: string
 *           X-Structured-Schema-Version:
 *             schema:
 *               type: string
 *           X-Annotation-Mode:
 *             schema:
 *               type: string
 *               enum: [none, visual_context]
 *           X-Page-Count:
 *             schema:
 *               type: integer
 *           X-Upload-Id:
 *             schema:
 *               type: string
 *               format: uuid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Climate Advisor service or user authentication is missing
 *       404:
 *         description: Completed structured artifact was not found
 *       409:
 *         description: Stored JSON failed its SHA-256 integrity check
 *       413:
 *         description: Stored JSON exceeds the response size limit
 */
import { createHash } from "node:crypto";

import createHttpError from "http-errors";
import { z } from "zod";

import { requireClimateAdvisorServiceRequest } from "@/backend/agentic/ghgi/stationary-energy/auth";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import { getPdfOcrConfig } from "@/backend/pdf-ocr-config";
import {
  getConceptNotePdfOcrJob,
  getConceptNoteSourceFormat,
} from "@/backend/PdfOcrService";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ uploadId: z.string().uuid() });

export const GET = apiHandler(async (req, { session, params }) => {
  requireClimateAdvisorServiceRequest(req);
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { uploadId } = paramsSchema.parse(params);
  const job = await getConceptNotePdfOcrJob(uploadId);
  const structuredSize = Number(job?.structuredSizeBytes);
  if (
    !job ||
    job.status !== "succeeded" ||
    getConceptNoteSourceFormat(job) !== "pdf" ||
    !job.pageCount ||
    !job.structuredS3Key ||
    !job.structuredSha256 ||
    !job.structuredSchemaVersion ||
    (job.annotationMode !== "none" && job.annotationMode !== "visual_context") ||
    !Number.isInteger(structuredSize) ||
    structuredSize < 1
  ) {
    throw new createHttpError.NotFound(
      "Completed Concept Note structured artifact was not found",
    );
  }
  if (structuredSize > getPdfOcrConfig().maxStructuredArtifactBytes) {
    throw new createHttpError.PayloadTooLarge(
      "Structured artifact exceeds the response size limit",
    );
  }

  const bytes = await InventoryFileStorageService.getFileBuffer(
    job.structuredS3Key,
  );
  if (bytes.byteLength > getPdfOcrConfig().maxStructuredArtifactBytes) {
    throw new createHttpError.PayloadTooLarge(
      "Structured artifact exceeds the response size limit",
    );
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== job.structuredSha256 || bytes.byteLength !== structuredSize) {
    throw new createHttpError.Conflict(
      "Stored Concept Note structured artifact failed its integrity check",
    );
  }

  return new Response(bytes.toString("utf8"), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(bytes.byteLength),
      "X-Structured-S3-Key": job.structuredS3Key,
      "X-Structured-SHA256": job.structuredSha256,
      "X-Structured-Schema-Version": job.structuredSchemaVersion,
      "X-Annotation-Mode": job.annotationMode,
      "X-Page-Count": String(job.pageCount),
      "X-Upload-Id": uploadId,
      "Cache-Control": "private, no-store",
    },
  });
});
