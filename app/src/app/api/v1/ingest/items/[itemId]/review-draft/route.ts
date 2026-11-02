/**
 * @swagger
 * /api/v1/ingest/items/{itemId}/review-draft:
 *   get:
 *     operationId: getIngestReviewDraft
 *     summary: Load a persisted ingest review draft
 *     tags:
 *       - ingest
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Review draft. readOnly is true when another collaborator holds the lock.
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Item not found
 *       409:
 *         description: Item is not awaiting review
 *   patch:
 *     operationId: patchIngestReviewDraft
 *     summary: Save ingest review draft progress
 *     tags:
 *       - ingest
 *     parameters:
 *       - in: path
 *         name: itemId
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
 *             required: [reviewDraftVersion, payload]
 *             properties:
 *               reviewDraftVersion:
 *                 type: integer
 *               payload:
 *                 description: Plugin-owned draft DTO
 *     responses:
 *       200:
 *         description: Updated draft envelope
 *       409:
 *         description: stale_review_draft or review_locked
 */

import { REVIEW_LOCK_MS } from "@/backend/ingest/review-draft";
import { loadIngestReviewContext } from "@/backend/ingest/http";
import { apiHandler } from "@/util/api";
import { patchIngestReviewDraftRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req, { session, params }) => {
  if (!session?.user) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const { runner } = await loadIngestReviewContext(params.itemId, session);
  const loaded = await runner.getReviewDraft(params.itemId, session.user.id);
  const lockedAt = loaded.item.reviewLockedAt;
  return NextResponse.json({
    data: {
      itemId: loaded.item.id,
      status: loaded.item.status,
      reviewDraftVersion: loaded.draft.version,
      reviewDraft: loaded.draft,
      readOnly: loaded.readOnly,
      editorUserId: loaded.editorUserId,
      lockExpiresAt: lockedAt
        ? new Date(lockedAt.getTime() + REVIEW_LOCK_MS).toISOString()
        : null,
    },
  });
});

export const PATCH = apiHandler(async (req, { session, params }) => {
  if (!session?.user) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const body = patchIngestReviewDraftRequest.parse(await req.json());
  const { runner } = await loadIngestReviewContext(params.itemId, session);
  const draft = await runner.saveReviewDraft(params.itemId, session.user.id, {
    payload: body.payload,
    reviewDraftVersion: body.reviewDraftVersion,
  });
  return NextResponse.json({ data: draft });
});
