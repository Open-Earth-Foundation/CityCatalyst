/**
 * @swagger
 * /api/v1/concept-notes/{runId}/structure:
 *   get:
 *     operationId: getConceptNoteStructure
 *     summary: Restore run-owned chapter structure
 *     tags: [concept-notes]
 *     responses:
 *       200:
 *         description: Ordered chapters and optimistic fingerprint
 *   put:
 *     operationId: saveConceptNoteStructure
 *     summary: Save chapter metadata and order against an exact snapshot
 *     tags: [concept-notes]
 *     responses:
 *       200:
 *         description: Saved structure
 *       409:
 *         description: Structure changed or drafting is running
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
import { structureSaveSchema } from "@/util/concept-note-structure";

const handler = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id)
    throw new createHttpError.Unauthorized("Authentication required");
  const runId = z.string().uuid().parse(params.runId);
  const body =
    req.method === "PUT"
      ? structureSaveSchema.parse(await req.json())
      : undefined;
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/structure`,
    method: req.method === "PUT" ? "PUT" : "GET",
    body,
    userId,
    requestId,
    searchParams: { user_id: userId },
  });
  return NextResponse.json(await readConceptNoteApiPayload(response), {
    status: response.status,
  });
});
export const GET = handler;
export const PUT = handler;
