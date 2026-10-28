/**
 * @swagger
 * /api/v1/concept-notes/{runId}/context-bundle/retry:
 *   post:
 *     operationId: retryConceptNoteContextBundle
 *     summary: Retry PDF-first Concept Note context-bundle assembly
 *     tags:
 *       - concept-notes
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       202:
 *         description: Background context-bundle rebuild queued
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City or run access denied
 *       404:
 *         description: Concept Note run not found
 *       503:
 *         description: Climate Advisor context storage is unavailable
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
    path: `/v1/concept-notes/${runId}/context-bundle/retry`,
    userId,
    method: "POST",
    requestId,
  });
  const payload = await readConceptNoteApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
});
