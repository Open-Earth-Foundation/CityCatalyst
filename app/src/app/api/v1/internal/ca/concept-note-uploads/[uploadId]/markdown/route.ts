/**
 * @swagger
 * /api/v1/internal/ca/concept-note-uploads/{uploadId}/markdown:
 *   get:
 *     operationId: getConceptNoteUploadMarkdown
 *     summary: Read verified CC-owned Markdown for Climate Advisor
 *     description: Requires Climate Advisor service authentication plus the CC-issued user bearer token. CA never receives S3 credentials or a signed URL.
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
 *         description: Verified Markdown bytes streamed by CityCatalyst
 *         headers:
 *           X-Markdown-S3-Key:
 *             description: Stable CC S3 object key used as pointer identity, not an access credential
 *             schema:
 *               type: string
 *           X-Markdown-SHA256:
 *             schema:
 *               type: string
 *           X-Page-Count:
 *             schema:
 *               type: integer
 *         content:
 *           text/markdown:
 *             schema:
 *               type: string
 *       401:
 *         description: Climate Advisor service or user authentication is missing
 *       404:
 *         description: Completed Markdown was not found
 *       409:
 *         description: Stored Markdown failed its SHA-256 integrity check
 */
import { createHash } from "node:crypto";

import createHttpError from "http-errors";
import { z } from "zod";

import { requireClimateAdvisorServiceRequest } from "@/backend/agentic/ghgi/stationary-energy/auth";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import { getConceptNotePdfOcrJob } from "@/backend/PdfOcrService";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ uploadId: z.string().uuid() });

export const GET = apiHandler(async (req, { session, params }) => {
  requireClimateAdvisorServiceRequest(req);
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { uploadId } = paramsSchema.parse(params);
  const job = await getConceptNotePdfOcrJob(uploadId);
  if (
    !job ||
    job.status !== "succeeded" ||
    !job.resultS3Key ||
    !job.resultSha256 ||
    !job.pageCount
  ) {
    throw new createHttpError.NotFound(
      "Completed Concept Note Markdown was not found",
    );
  }

  const markdown = await InventoryFileStorageService.getFileBuffer(
    job.resultS3Key,
  );
  const digest = createHash("sha256").update(markdown).digest("hex");
  if (digest !== job.resultSha256) {
    throw new createHttpError.Conflict(
      "Stored Concept Note Markdown failed its integrity check",
    );
  }

  return new Response(markdown.toString("utf8"), {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Length": String(markdown.byteLength),
      "X-Markdown-S3-Key": job.resultS3Key,
      "X-Markdown-SHA256": job.resultSha256,
      "X-Page-Count": String(job.pageCount),
      "Cache-Control": "private, no-store",
    },
  });
});
