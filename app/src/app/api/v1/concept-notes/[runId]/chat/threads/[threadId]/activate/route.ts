/**
 * @swagger
 * /api/v1/concept-notes/{runId}/chat/threads/{threadId}/activate:
 *   post:
 *     operationId: activateConceptNoteChatThread
 *     summary: Switch a Concept Note back to one of its earlier chats
 *     tags:
 *       - concept-notes
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: city_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Chat activated and updated run returned
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City access denied
 *       404:
 *         description: Run or attached chat not found
 *       409:
 *         description: Run is busy
 */
import createHttpError from "http-errors";
import { z } from "zod";

import {
  callAuthorizedConceptNoteApi,
  conceptNoteRunResponse,
} from "@/backend/concept-notes";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({
  runId: z.string().uuid(),
  threadId: z.string().uuid(),
});
const querySchema = z.object({ city_id: z.string().uuid() });

export const POST = apiHandler(
  async (req, { session, params, searchParams }) => {
    if (!session?.user?.id) {
      throw new createHttpError.Unauthorized("Authentication required");
    }

    const { runId, threadId } = paramsSchema.parse(params);
    const { city_id: cityId } = querySchema.parse(searchParams);
    const response = await callAuthorizedConceptNoteApi({
      cityId,
      path: `/v1/concept-notes/${runId}/chat/threads/${threadId}/activate`,
      method: "POST",
      requestId: req.headers.get("x-request-id")?.trim() || undefined,
      searchParams: { user_id: session.user.id },
      session,
    });
    return conceptNoteRunResponse(response, cityId);
  },
);
