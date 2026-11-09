/**
 * @swagger
 * /api/v1/ingest/documents/{documentId}/supersede:
 *   post:
 *     operationId: supersedeIngestDocument
 *     summary: Point a pooled document at a replacement without changing imported values
 *     description: Marks the old Path B superseded and sets supersededById to the replacement catalog row.
 *     tags:
 *       - ingest
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [replacementDocumentId]
 *             properties:
 *               replacementDocumentId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Supersede chain written
 *       403:
 *         description: Caller is not the author or an org/project admin
 *       404:
 *         description: document_not_found
 *       409:
 *         description: stale document (withdrawn or already superseded)
 */

import { loadManagedIngestDocument } from "@/backend/ingest/http";
import { apiHandler } from "@/util/api";
import { supersedeIngestDocumentRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const body = supersedeIngestDocumentRequest.parse(await req.json());
  const { pool } = await loadManagedIngestDocument(params.documentId, session);
  const result = await pool.supersede(
    params.documentId,
    body.replacementDocumentId,
  );
  return NextResponse.json({
    data: {
      documentId: result.previous.id,
      availability: result.previous.availability,
      supersededByDocumentId: result.replacement.id,
      replacementDocumentId: result.replacement.id,
    },
  });
});
