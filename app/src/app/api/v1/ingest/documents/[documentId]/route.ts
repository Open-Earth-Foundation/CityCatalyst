/**
 * @swagger
 * /api/v1/ingest/documents/{documentId}:
 *   delete:
 *     operationId: withdrawIngestDocument
 *     summary: Withdraw a pooled document without deleting imported values
 *     description: Marks Path B withdrawn and keeps bytes. Path A extracts stay active unless withdrawExtractsFor names a module.
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               withdrawExtractsFor:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [test, ghgi, ccra, cnb]
 *               deleteImportedData:
 *                 type: boolean
 *                 enum: [true]
 *                 description: Confirmed exception. Withdraws every extract and deletes inventory values created from this document. The catalog row stays.
 *     responses:
 *       200:
 *         description: Document is withdrawn
 *       403:
 *         description: Caller is not the author or an org/project admin
 *       404:
 *         description: document_not_found
 *       409:
 *         description: document_superseded
 */

import { deleteImportedDataForDocument } from "@/backend/ingest/delete-imported-data";
import { loadManagedIngestDocument } from "@/backend/ingest/http";
import { apiHandler } from "@/util/api";
import { withdrawIngestDocumentRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const DELETE = apiHandler(async (req, { session, params }) => {
  if (!session?.user) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  let body: ReturnType<typeof withdrawIngestDocumentRequest.parse> = {};
  const text = await req.text();
  if (text.trim()) {
    body = withdrawIngestDocumentRequest.parse(JSON.parse(text));
  }
  const { pool } = await loadManagedIngestDocument(params.documentId, session);
  if (body.deleteImportedData) {
    const { removed } = await deleteImportedDataForDocument(
      params.documentId,
      session.user.id,
    );
    return NextResponse.json({
      data: {
        documentId: params.documentId,
        availability: "withdrawn",
        removedInventoryValues: removed,
      },
    });
  }
  const document = await pool.withdraw(params.documentId, {
    withdrawExtractsFor: body.withdrawExtractsFor,
  });
  return NextResponse.json({
    data: {
      documentId: document.id,
      availability: document.availability,
      supersededByDocumentId: document.supersededByDocumentId ?? null,
    },
  });
});
