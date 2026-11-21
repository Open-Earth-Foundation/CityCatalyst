/**
 * @swagger
 * /api/v1/concept-notes/{runId}/chapters/{chapterId}/gaps:
 *   post:
 *     operationId: adoptConceptNoteMarkerGap
 *     summary: Track an unrecorded missing-information marker as a gap
 *     description: Creates the open gap record for one "[Information needed: …]" marker that has none (runs drafted before structured gaps), or returns its existing record, so the gap form can answer and close it. The chapter text is unchanged.
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
 *             required: [marker]
 *             properties:
 *               marker:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2100
 *     responses:
 *       200:
 *         description: The draft, including the marker's open gap
 *       409:
 *         description: The marker is no longer in the chapter, or its gap is closed
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
const bodySchema = z.object({ marker: z.string().min(1).max(2100) }).strict();

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const { runId, chapterId } = paramsSchema.parse(params);
  const body = bodySchema.parse(await req.json());
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  // Authorize against the run's own city, never a city from the request.
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });

  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/chapters/${chapterId}/gaps`,
    method: "POST",
    body,
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  const payload = await readConceptNoteApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
});
