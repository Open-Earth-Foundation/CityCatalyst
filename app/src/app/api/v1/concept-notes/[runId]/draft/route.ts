/**
 * @swagger
 * /api/v1/concept-notes/{runId}/draft:
 *   parameters:
 *     - in: path
 *       name: runId
 *       required: true
 *       schema:
 *         type: string
 *         format: uuid
 *   get:
 *     operationId: getConceptNoteDraft
 *     summary: Get persisted chapter drafting state
 *     description: Returns the current chapter-drafting workspace for an authorized concept note run.
 *     tags:
 *       - concept-notes
 *     responses:
 *       200:
 *         description: Chapter-drafting state returned
 *       400:
 *         description: Invalid run identifier
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City or run access denied
 *       404:
 *         description: Concept note run not found
 *       503:
 *         description: Chapter drafting is unavailable
 *   post:
 *     operationId: startConceptNoteDraft
 *     summary: Start or resume sequential chapter drafting
 *     description: Starts or resumes the sequential chapter-drafting process for an authorized concept note run.
 *     tags:
 *       - concept-notes
 *     responses:
 *       202:
 *         description: Chapter drafting accepted
 *       400:
 *         description: Invalid run identifier
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City or run access denied
 *       404:
 *         description: Concept note run not found
 *       409:
 *         description: Chapter drafting cannot start in the current state
 *       503:
 *         description: Chapter drafting is unavailable
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

const paramsSchema = z.object({ runId: z.string().uuid() });

export const GET = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const { runId } = paramsSchema.parse(params);
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });

  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/draft`,
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  const payload = await readConceptNoteApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
});

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const { runId } = paramsSchema.parse(params);
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });

  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/draft`,
    method: "POST",
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  const payload = await readConceptNoteApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
});
