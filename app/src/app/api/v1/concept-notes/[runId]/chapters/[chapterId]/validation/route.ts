/**
 * @swagger
 * /api/v1/concept-notes/{runId}/chapters/{chapterId}/validation:
 *   parameters:
 *     - in: path
 *       name: runId
 *       required: true
 *       schema:
 *         type: string
 *         format: uuid
 *     - in: path
 *       name: chapterId
 *       required: true
 *       schema:
 *         type: string
 *         format: uuid
 *   post:
 *     operationId: validateConceptNoteChapter
 *     summary: Validate a concept-note chapter and attempt to mark it ready
 *     tags:
 *       - concept-notes
 *     responses:
 *       200:
 *         description: Chapter validation completed
 *       400:
 *         description: Invalid run or chapter identifier
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City or run access denied
 *       404:
 *         description: Concept note run or chapter not found
 *       409:
 *         description: Chapter inputs changed during validation
 *       503:
 *         description: Chapter validation is unavailable
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
  chapterId: z.string().uuid(),
  runId: z.string().uuid(),
});

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const { chapterId, runId } = paramsSchema.parse(params);
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });

  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/chapters/${chapterId}/validation`,
    method: "POST",
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  const payload = await readConceptNoteApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
});
