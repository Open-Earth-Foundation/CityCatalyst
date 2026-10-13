/**
 * @swagger
 * /api/v1/concept-notes/{runId}/application-context:
 *   patch:
 *     operationId: updateConceptNoteFundingSelection
 *     summary: Save a compatible funder and programme selection
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [funder_id, selected_funding_opportunity_id, expected_funder_id, expected_funding_opportunity_id]
 *             properties:
 *               funder_id: { type: string, format: uuid, nullable: true }
 *               selected_funding_opportunity_id: { type: string, format: uuid, nullable: true }
 *               expected_funder_id: { type: string, format: uuid, nullable: true }
 *               expected_funding_opportunity_id: { type: string, format: uuid, nullable: true }
 *               acknowledge_draft_review: { type: boolean }
 *     responses:
 *       200: { description: Selection saved }
 *       401: { description: Authentication required }
 *       403: { description: City or run access denied }
 *       409: { description: Selection changed or review acknowledgement required }
 *       422: { description: Invalid funding relationship }
 *   get:
 *     operationId: getConceptNoteApplicationContext
 *     summary: Get the selected funder, programme, and template for a concept note
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
 *       200:
 *         description: Application context returned
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City or run access denied
 *       404:
 *         description: Concept note run not found
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
import { conceptNoteFundingSelectionRequest } from "@/util/validation";

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
    path: `/v1/concept-notes/${runId}/application-context`,
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  const payload = await readConceptNoteApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
});

export const PATCH = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId } = paramsSchema.parse(params);
  const body = conceptNoteFundingSelectionRequest.parse(await req.json());
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/application-context`,
    method: "PATCH",
    body,
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  return NextResponse.json(await readConceptNoteApiPayload(response), {
    status: response.status,
  });
});
