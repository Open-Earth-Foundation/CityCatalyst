/**
 * @swagger
 * /api/v1/concept-notes/{runId}/chat/threads:
 *   parameters:
 *     - in: path
 *       name: runId
 *       required: true
 *       schema:
 *         type: string
 *         format: uuid
 *     - in: query
 *       name: city_id
 *       required: true
 *       schema:
 *         type: string
 *         format: uuid
 *   get:
 *     operationId: listConceptNoteChatThreads
 *     summary: List the chats attached to a Concept Note, newest first
 *     tags:
 *       - concept-notes
 *     responses:
 *       200:
 *         description: Attached chats and the active chat identifier
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City access denied
 *       404:
 *         description: Run not found
 *   post:
 *     operationId: startConceptNoteChat
 *     summary: Open a new chat on a Concept Note and make it active
 *     tags:
 *       - concept-notes
 *     responses:
 *       201:
 *         description: Chat opened and updated run returned
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City access denied
 *       404:
 *         description: Run not found
 *       409:
 *         description: Run is busy
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  callAuthorizedConceptNoteApi,
  conceptNoteRunResponse,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ runId: z.string().uuid() });
const querySchema = z.object({ city_id: z.string().uuid() });

export const GET = apiHandler(
  async (req, { session, params, searchParams }) => {
    if (!session?.user?.id) {
      throw new createHttpError.Unauthorized("Authentication required");
    }

    const { runId } = paramsSchema.parse(params);
    const { city_id: cityId } = querySchema.parse(searchParams);
    const response = await callAuthorizedConceptNoteApi({
      cityId,
      path: `/v1/concept-notes/${runId}/chat/threads`,
      requestId: req.headers.get("x-request-id")?.trim() || undefined,
      searchParams: { user_id: session.user.id },
      session,
    });
    const payload = await readConceptNoteApiPayload(response);
    return NextResponse.json(payload, { status: response.status });
  },
);

export const POST = apiHandler(
  async (req, { session, params, searchParams }) => {
    if (!session?.user?.id) {
      throw new createHttpError.Unauthorized("Authentication required");
    }

    const { runId } = paramsSchema.parse(params);
    const { city_id: cityId } = querySchema.parse(searchParams);
    const response = await callAuthorizedConceptNoteApi({
      cityId,
      path: `/v1/concept-notes/${runId}/chat/threads`,
      method: "POST",
      requestId: req.headers.get("x-request-id")?.trim() || undefined,
      searchParams: { user_id: session.user.id },
      session,
    });
    return conceptNoteRunResponse(response, cityId);
  },
);
