/**
 * @swagger
 * /api/v1/ingest/documents/{documentId}/promote:
 *   post:
 *     operationId: promoteIngestDocumentToCity
 *     summary: Mark a concept-note attachment as a city document
 *     description: Changes visibility from run to city so other modules can ingest the same bytes. Author, org admin, or project admin only.
 *     tags:
 *       - ingest
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Document is a city document
 *       400:
 *         description: Document is not a concept-note attachment
 *       403:
 *         description: Caller is not the author or an org/project admin
 *       404:
 *         description: document_not_found
 *       409:
 *         description: document_withdrawn or document_superseded
 */

import { loadManagedIngestDocument } from "@/backend/ingest/http";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const POST = apiHandler(async (_req, { session, params }) => {
  if (!session?.user) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const { pool } = await loadManagedIngestDocument(params.documentId, session);
  const document = await pool.promoteToCity(params.documentId);
  return NextResponse.json({
    data: {
      documentId: document.id,
      visibility: document.visibility,
    },
  });
});
