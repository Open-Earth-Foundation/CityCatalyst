/**
 * @swagger
 * /api/v1/concept-notes/{runId}/documents:
 *   parameters:
 *     - in: path
 *       name: runId
 *       required: true
 *       schema: { type: string, format: uuid }
 *   get:
 *     operationId: listConceptNoteReusableDocuments
 *     summary: List active city documents accessible to this Concept Note run
 *     tags: [concept-notes]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, minimum: 0, maximum: 10000, default: 0 }
 *     responses:
 *       200:
 *         description: Safe document metadata and bounded pagination; no original bytes or storage keys
 *       400:
 *         description: Invalid run or pagination
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Run or city access denied
 *       404:
 *         description: Run or Concept Note Builder unavailable
 *   post:
 *     operationId: attachConceptNotePooledDocument
 *     summary: Attach an existing city document using a run-specific upload identity
 *     description: Replays reuse the same upload and pool document. Original source visibility stays unchanged. PDF bytes are copied to the immutable target upload key and queued through existing OCR; Markdown enters the existing delivery pipeline.
 *     tags: [concept-notes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [document_id]
 *             additionalProperties: false
 *             properties:
 *               document_id: { type: string, format: uuid }
 *               source_role: { type: string, enum: [reference, climate_action_plan], default: reference }
 *     responses:
 *       202:
 *         description: Existing upload processing contract plus documentId; uploadId, status, stage, canRetry, filename, sourceLabel, sourceRole, and optional retryKind
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Run or city access denied, or organization frozen
 *       404:
 *         description: Active reusable document or authorized run not found
 *       409:
 *         description: Upload limit, source role conflict, or registered document identity mismatch
 *       422:
 *         description: Document format, content, or size is invalid
 *       502:
 *         description: Invalid Climate Advisor upload response
 *       503:
 *         description: Document storage or processing unavailable
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

import {
  attachConceptNoteDocument,
  conceptNoteDocumentAttach,
  conceptNoteDocumentParams,
  conceptNoteDocumentQuery,
  listConceptNoteDocuments,
  loadConceptNoteDocumentTarget,
} from "@/backend/concept-note-document-pool";
import { apiHandler } from "@/util/api";

export const GET = apiHandler(
  async (req, { session, params, searchParams }) => {
    const { runId } = conceptNoteDocumentParams.parse(params);
    const page = conceptNoteDocumentQuery.parse(searchParams);
    const target = await loadConceptNoteDocumentTarget(
      session,
      runId,
      req.headers.get("x-request-id")?.trim() || undefined,
    );
    return NextResponse.json(await listConceptNoteDocuments(target, page));
  },
);

export const POST = apiHandler(async (req, { session, params }) => {
  const { runId } = conceptNoteDocumentParams.parse(params);
  const target = await loadConceptNoteDocumentTarget(
    session,
    runId,
    req.headers.get("x-request-id")?.trim() || undefined,
    true,
  );
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new createHttpError.BadRequest("Invalid JSON body");
  }
  const input = conceptNoteDocumentAttach.parse(body);
  const result = await attachConceptNoteDocument(target, input);
  return NextResponse.json(result.payload, { status: result.status });
});
