/**
 * @swagger
 * /api/v1/concept-notes/{runId}/gaps/{gapId}/answers:
 *   post:
 *     operationId: saveConceptNoteGapAnswers
 *     summary: Save the answers given so far for an open gap version
 *     description: Stores the answers on the gap without changing the draft, so every device and teammate sees them as answered_so_far. Empty answers clear them.
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: gapId
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
 *             required: [gap_version]
 *             properties:
 *               gap_version:
 *                 type: integer
 *                 minimum: 1
 *               answers:
 *                 type: string
 *                 maxLength: 8000
 *                 description: Every answer given so far; empty clears the saved answers
 *     responses:
 *       204:
 *         description: Answers saved
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City or run access denied
 *       409:
 *         description: Gap is no longer open at that version
 */
import createHttpError from "http-errors";
import { z } from "zod";

import { proxyConceptNoteRunRequest } from "@/backend/concept-note-run-proxy";
import { apiHandler } from "@/util/api";

const bodySchema = z
  .object({
    gap_version: z.number().int().positive(),
    answers: z.string().max(8000).default(""),
  })
  .strict();

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId, gapId } = z
    .object({ runId: z.string().uuid(), gapId: z.string().uuid() })
    .parse(params);
  return proxyConceptNoteRunRequest(req, session, {
    runId,
    path: `/v1/concept-notes/${runId}/gaps/${gapId}/answers`,
    method: "POST",
    body: bodySchema.parse(await req.json()),
  });
});
