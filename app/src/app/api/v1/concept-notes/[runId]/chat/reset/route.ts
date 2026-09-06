/**
 * @swagger
 * /api/v1/concept-notes/{runId}/chat/reset:
 *   post:
 *     operationId: resetConceptNoteChat
 *     summary: Replace a Concept Note's chat with a fresh thread
 *     tags:
 *       - concept-notes
 *     responses:
 *       200:
 *         description: Chat reset and updated run returned
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City access denied
 *       404:
 *         description: Run not found
 *       409:
 *         description: Run is busy or its chat is shared
 */
import createHttpError from "http-errors";
import { z } from "zod";

import {
  callAuthorizedConceptNoteApi,
  conceptNoteRunResponse,
} from "@/backend/concept-notes";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ runId: z.string().uuid() });
const querySchema = z.object({ city_id: z.string().uuid() });

export const POST = apiHandler(
  async (req, { session, params, searchParams }) => {
    if (!session?.user?.id) {
      throw new createHttpError.Unauthorized("Authentication required");
    }

    const { runId } = paramsSchema.parse(params);
    const { city_id: cityId } = querySchema.parse(searchParams);
    const response = await callAuthorizedConceptNoteApi({
      cityId,
      path: `/v1/concept-notes/${runId}/chat/reset`,
      method: "POST",
      requestId: req.headers.get("x-request-id")?.trim() || undefined,
      searchParams: { user_id: session.user.id },
      session,
    });
    return conceptNoteRunResponse(response, cityId);
  },
);
