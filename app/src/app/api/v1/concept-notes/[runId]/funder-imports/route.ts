/**
 * @swagger
 * /api/v1/concept-notes/{runId}/funder-imports:
 *   post:
 *     operationId: startConceptNoteFunderImport
 *     summary: Start reading funder, programme and template details from a converted upload
 *     description: The upload must belong to the run and have finished converting. Replaces any ready or failed import; read the result with GET funder-imports/current.
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
 *             required: [uploadId]
 *             properties:
 *               uploadId: { type: string, format: uuid }
 *     responses:
 *       202: { description: Import started; returns the current funder import }
 *       401: { description: Authentication required }
 *       403: { description: City or run access denied }
 *       404: { description: Upload not found on this run }
 *       409: { description: Upload not converted yet or another import is running }
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
import { conceptNoteFunderImportStartRequest } from "@/util/validation";

const paramsSchema = z.object({ runId: z.string().uuid() });

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId } = paramsSchema.parse(params);
  const { uploadId } = conceptNoteFunderImportStartRequest.parse(
    await req.json(),
  );
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/funder-imports`,
    method: "POST",
    body: { upload_id: uploadId },
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  return NextResponse.json(await readConceptNoteApiPayload(response), {
    status: response.status,
  });
});
