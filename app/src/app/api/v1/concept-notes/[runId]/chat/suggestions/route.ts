/**
 * @swagger
 * /api/v1/concept-notes/{runId}/chat/suggestions:
 *   post:
 *     operationId: proposeConceptNoteChatQuestions
 *     summary: Propose two questions for the authorized concept note chat
 *     tags:
 *       - concept-notes
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               language:
 *                 type: string
 *               tab:
 *                 type: string
 *                 enum: [draft, structure, context]
 *     responses:
 *       200:
 *         description: Two questions, or an empty list for the localized fallback
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City or run access denied
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import { loadConceptNoteRunCity } from "@/backend/ConceptNoteUploadService";
import {
  callAuthorizedConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ runId: z.string().uuid() });
const bodySchema = z
  .object({
    language: z
      .string()
      .regex(/^[a-z]{2}(?:-[A-Za-z]{2})?$/)
      .default("en"),
    tab: z.enum(["draft", "structure", "context"]).default("draft"),
  })
  .strict();

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId } = paramsSchema.parse(params);
  const body = bodySchema.parse(await req.json());
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  const response = await callAuthorizedConceptNoteApi({
    path: `/v1/concept-notes/${runId}/chat/suggestions`,
    method: "POST",
    signal: req.signal,
    session,
    cityId,
    requestId,
    searchParams: { user_id: userId },
    body,
  });
  return NextResponse.json(await readConceptNoteApiPayload(response), {
    status: response.status,
    headers: { "Cache-Control": "no-store" },
  });
});
