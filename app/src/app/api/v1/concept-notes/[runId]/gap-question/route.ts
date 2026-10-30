/**
 * @swagger
 * /api/v1/concept-notes/{runId}/gap-question:
 *   post:
 *     operationId: proposeConceptNoteGapQuestion
 *     summary: Generate a focused question and answer choices for an authorized gap
 *     tags: [concept-notes]
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
 *             required: [chapter_id, gap_id, question]
 *             properties:
 *               chapter_id:
 *                 type: string
 *                 format: uuid
 *               gap_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               question:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 *               language:
 *                 type: string
 *                 default: en
 *     responses:
 *       200:
 *         description: A focused question, rationale, and zero or two to five options
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City or run access denied
 *       404:
 *         description: Chapter or legacy question not found
 *       409:
 *         description: Gap is no longer open
 *       503:
 *         description: Question generation unavailable; retry or use free text
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

const bodySchema = z
  .object({
    chapter_id: z.string().uuid(),
    gap_id: z.string().uuid().nullable(),
    question: z.string().trim().min(1).max(2000),
    language: z
      .string()
      .regex(/^[a-z]{2}(?:-[A-Za-z]{2})?$/)
      .default("en"),
  })
  .strict();

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId } = z.object({ runId: z.string().uuid() }).parse(params);
  const body = bodySchema.parse(await req.json());
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  const response = await callAuthorizedConceptNoteApi({
    path: `/v1/concept-notes/${runId}/gap-question`,
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
