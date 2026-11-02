/**
 * @swagger
 * /api/v1/ingest/items/{itemId}/review-draft/approve:
 *   post:
 *     operationId: approveIngestReviewDraft
 *     summary: Commit a stored ingest review draft without re-uploading
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
 *             required: [reviewDraftVersion]
 *             properties:
 *               reviewDraftVersion:
 *                 type: integer
 *               targetBinding:
 *                 type: object
 *                 properties:
 *                   cityId:
 *                     type: string
 *                     format: uuid
 *                   inventoryId:
 *                     type: string
 *                     format: uuid
 *     responses:
 *       200:
 *         description: Item completed from the stored bundle
 *       409:
 *         description: stale_review_draft or review_locked
 */

import { loadIngestReviewContext } from "@/backend/ingest/http";
import { createIngestPlugin } from "@/backend/ingest/registry";
import { apiHandler } from "@/util/api";
import { approveIngestReviewDraftRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const body = approveIngestReviewDraftRequest.parse(await req.json());
  const { runner, job } = await loadIngestReviewContext(params.itemId, session);
  const item = await runner.confirmReview(
    params.itemId,
    createIngestPlugin(job.moduleId),
    {
      userId: session.user.id,
      reviewDraftVersion: body.reviewDraftVersion,
      targetBinding: body.targetBinding,
    },
  );
  return NextResponse.json({
    data: {
      itemId: item.id,
      status: item.status,
      result: item.result,
      reviewDraftVersion: item.reviewDraftVersion,
    },
  });
});
