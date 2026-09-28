/**
 * @swagger
 * /api/v1/concept-notes/{runId}/funder-imports/current/retry:
 *   post:
 *     operationId: retryConceptNoteFunderImport
 *     summary: Read the same upload again after a failed funder import
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       202: { description: Import restarted; returns the current funder import }
 *       401: { description: Authentication required }
 *       403: { description: City or run access denied }
 *       409: { description: There is no failed import to retry }
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
    path: `/v1/concept-notes/${runId}/funder-imports/current/retry`,
    method: "POST",
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  return NextResponse.json(await readConceptNoteApiPayload(response), {
    status: response.status,
  });
});
