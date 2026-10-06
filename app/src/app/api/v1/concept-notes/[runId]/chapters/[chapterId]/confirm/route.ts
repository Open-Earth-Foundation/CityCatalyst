/**
 * @swagger
 * /api/v1/concept-notes/{runId}/chapters/{chapterId}/confirm:
 *   post:
 *     operationId: confirmConceptNoteChapter
 *     summary: Confirm one exact concept note chapter revision
 *     description: Confirms the current gap-free revision and moves the chapter to Ready.
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
 *         name: chapterId
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
 *             required: [expected_revision, idempotency_key]
 *             properties:
 *               expected_revision:
 *                 type: integer
 *                 minimum: 1
 *               idempotency_key:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Chapter revision confirmed as Ready
 *       409:
 *         description: Revision is stale or blocking gaps remain
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
  chapterId: z.string().uuid(),
});
const bodySchema = z.object({
  expected_revision: z.number().int().positive(),
  idempotency_key: z.string().uuid(),
});

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const { runId, chapterId } = paramsSchema.parse(params);
  const body = bodySchema.parse(await req.json());
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });

  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/chapters/${chapterId}/confirm`,
    method: "POST",
    body,
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  const payload = await readConceptNoteApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
});
