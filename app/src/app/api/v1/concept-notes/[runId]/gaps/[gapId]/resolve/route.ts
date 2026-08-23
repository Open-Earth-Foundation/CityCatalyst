/**
 * @swagger
 * /api/v1/concept-notes/{runId}/gaps/{gapId}/resolve:
 *   post:
 *     operationId: resolveConceptNoteGap
 *     summary: Resolve or defer a structured concept note gap
 *     description: Records one versioned, idempotent gap decision and queues regeneration of the affected chapter.
 *     tags:
 *       - concept-notes
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: gapId
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
 *             required: [action, expected_version, idempotency_key]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [answer, correction, not_a_gap, defer_as_caveat]
 *               answer:
 *                 type: string
 *               expected_version:
 *                 type: integer
 *                 minimum: 1
 *               idempotency_key:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       202:
 *         description: Gap resolution accepted and regeneration queued
 *       409:
 *         description: Gap version is stale or the action is not allowed
 *       422:
 *         description: Gap action payload is invalid
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import { loadConceptNoteRunCity } from "@/backend/ConceptNoteUploadService";
import {
  callConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({
  runId: z.string().uuid(),
  gapId: z.string().uuid(),
});
const bodySchema = z
  .object({
    action: z.enum(["answer", "correction", "not_a_gap", "defer_as_caveat"]),
    answer: z.string().trim().min(1).max(10_000).optional(),
    expected_version: z.number().int().positive(),
    idempotency_key: z.string().uuid(),
  })
  .superRefine((value, context) => {
    const needsAnswer =
      value.action === "answer" || value.action === "correction";
    if (needsAnswer !== Boolean(value.answer)) {
      context.addIssue({
        code: "custom",
        message: needsAnswer
          ? "An answer is required for this action"
          : "This action does not accept an answer",
        path: ["answer"],
      });
    }
  });

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const { runId, gapId } = paramsSchema.parse(params);
  const body = bodySchema.parse(await req.json());
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });

  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/gaps/${gapId}/resolve`,
    method: "POST",
    body,
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  const payload = await readConceptNoteApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
});
