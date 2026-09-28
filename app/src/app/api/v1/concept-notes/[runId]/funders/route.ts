/**
 * @swagger
 * /api/v1/concept-notes/{runId}/funders:
 *   post:
 *     operationId: createConceptNoteFunder
 *     summary: Add a reviewed funder, programme and application template to the funding catalogue
 *     description: Send import_id when the values were reviewed from a ready document import so the server records where each value came from; send null for details entered by hand. Selecting the new funder is a separate application-context update.
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
 *             required: [funder, opportunity, template, import_id]
 *             properties:
 *               funder: { type: object }
 *               opportunity: { type: object }
 *               template: { type: object }
 *               import_id: { type: string, format: uuid, nullable: true }
 *     responses:
 *       201:
 *         description: Catalogue rows created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [funder_id, funding_opportunity_id]
 *               properties:
 *                 funder_id: { type: string, format: uuid }
 *                 funding_opportunity_id: { type: string, format: uuid }
 *       400: { description: Invalid funder details }
 *       401: { description: Authentication required }
 *       403: { description: City or run access denied }
 *       409: { description: The document import changed or the funder was already added }
 *       422: { description: Invalid funder details }
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
import { conceptNoteFunderCreateRequest } from "@/util/validation";

const paramsSchema = z.object({ runId: z.string().uuid() });

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId } = paramsSchema.parse(params);
  const body = conceptNoteFunderCreateRequest.parse(await req.json());
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/funders`,
    method: "POST",
    body,
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  return NextResponse.json(await readConceptNoteApiPayload(response), {
    status: response.status,
  });
});
