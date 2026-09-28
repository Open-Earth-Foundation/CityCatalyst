/**
 * @swagger
 * /api/v1/concept-notes/{runId}/funder-imports/current:
 *   get:
 *     operationId: getConceptNoteFunderImport
 *     summary: Get the pending funder document import, with its draft when ready
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Current funder import, or null when none is pending }
 *       401: { description: Authentication required }
 *       403: { description: City or run access denied }
 *       404: { description: Concept note run not found }
 *   delete:
 *     operationId: discardConceptNoteFunderImport
 *     summary: Discard the pending funder document import
 *     description: The uploaded file stays a source of the note; the result of a running extraction is ignored.
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Import discarded }
 *       401: { description: Authentication required }
 *       403: { description: City or run access denied }
 *       404: { description: Concept note run not found }
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
    path: `/v1/concept-notes/${runId}/funder-imports/current`,
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  return NextResponse.json(await readConceptNoteApiPayload(response), {
    status: response.status,
  });
});

export const DELETE = apiHandler(async (req, { session, params }) => {
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
    path: `/v1/concept-notes/${runId}/funder-imports/current`,
    method: "DELETE",
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(await readConceptNoteApiPayload(response), {
    status: response.status,
  });
});
