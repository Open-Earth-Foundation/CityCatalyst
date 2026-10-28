/**
 * @swagger
 * /api/v1/concept-notes/{runId}/funding-catalogue:
 *   get:
 *     operationId: getConceptNoteFundingCatalogue
 *     summary: Browse all database funders, programmes and templates
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Funding catalogue returned }
 *       401: { description: Authentication required }
 *       403: { description: City or run access denied }
 *       404: { description: Concept note run not found }
 *       503: { description: Funding database unavailable }
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

export const GET = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id)
    throw new createHttpError.Unauthorized("Authentication required");
  const runId = z.string().uuid().parse(params.runId);
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/funding-catalogue`,
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  return NextResponse.json(await readConceptNoteApiPayload(response), {
    status: response.status,
  });
});
