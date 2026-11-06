/**
 * @swagger
 * /api/v1/ingest/items/{itemId}/column-map/confirm:
 *   post:
 *     operationId: confirmIngestColumnMap
 *     summary: Confirm a proposed ingest column map and continue the job
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
 *             required: [reviewDraftVersion, mappings]
 *             properties:
 *               reviewDraftVersion:
 *                 type: integer
 *               mappings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [sourceColumn, taxonomyField]
 *                   properties:
 *                     sourceColumn:
 *                       type: string
 *                     taxonomyField:
 *                       type: string
 *     responses:
 *       200:
 *         description: Map stored; item continued to adapt/validate/decide
 *       409:
 *         description: mapping_incomplete, stale_review_draft, or review_locked
 */

import { loadIngestReviewContext } from "@/backend/ingest/http";
import { createIngestPlugin } from "@/backend/ingest/registry";
import { apiHandler } from "@/util/api";
import { confirmIngestColumnMapRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const body = confirmIngestColumnMapRequest.parse(await req.json());
  const { runner, job } = await loadIngestReviewContext(params.itemId, session);
  const item = await runner.confirmColumnMapping(
    params.itemId,
    createIngestPlugin(job.moduleId),
    {
      userId: session.user.id,
      reviewDraftVersion: body.reviewDraftVersion,
      mappings: body.mappings,
    },
  );
  return NextResponse.json({
    data: {
      itemId: item.id,
      status: item.status,
      result: item.result,
      reviewDraftVersion: item.reviewDraftVersion,
      columnMapping: item.reviewDraft?.columnMapping ?? null,
    },
  });
});
