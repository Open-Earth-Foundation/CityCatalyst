/**
 * @swagger
 * /api/v1/concept-notes/{runId}:
 *   get:
 *     operationId: getConceptNoteRun
 *     summary: Get an authorized Concept Note Builder run
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
 *         description: Run returned
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City access denied
 *       404:
 *         description: Run not found
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  callConceptNoteApi,
  conceptNoteRunResponse,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({
  runId: z.string().uuid(),
});

const renameSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const GET = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const { runId } = paramsSchema.parse(params);
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}`,
    userId: session.user.id,
    requestId: req.headers.get("x-request-id")?.trim() || undefined,
    searchParams: { user_id: session.user.id },
  });
  return conceptNoteRunResponse(response, session);
});

export const PATCH = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId } = paramsSchema.parse(params);
  const body = renameSchema.parse(await req.json());
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}`,
    userId: session.user.id,
    method: "PATCH",
    body,
    requestId: req.headers.get("x-request-id")?.trim() || undefined,
    searchParams: { user_id: session.user.id },
  });
  return conceptNoteRunResponse(response, session);
});

export const DELETE = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId } = paramsSchema.parse(params);
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}`,
    userId: session.user.id,
    method: "DELETE",
    requestId: req.headers.get("x-request-id")?.trim() || undefined,
    searchParams: { user_id: session.user.id },
  });
  if (response.status === 204) {
    return new Response(null, { status: 204 });
  }
  const payload = await readConceptNoteApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
});
