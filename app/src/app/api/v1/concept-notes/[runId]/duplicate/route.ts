/**
 * @swagger
 * /api/v1/concept-notes/{runId}/duplicate:
 *   post:
 *     operationId: duplicateConceptNoteRun
 *     summary: Create an independent working copy of a concept note
 *     tags: [concept-notes]
 *     responses:
 *       201:
 *         description: Working copy created
 *       200:
 *         description: Idempotent replay returned the existing copy
 *       409:
 *         description: Lifecycle conflict or idempotency mismatch
 */
import createHttpError from "http-errors";
import { z } from "zod";

import {
  callConceptNoteApi,
  conceptNoteRunResponse,
} from "@/backend/concept-notes";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ runId: z.string().uuid() });
const idempotencyKeySchema = z.string().uuid();

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId } = paramsSchema.parse(params);
  const idempotencyKey = idempotencyKeySchema.parse(
    req.headers.get("Idempotency-Key"),
  );
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/duplicate`,
    userId: session.user.id,
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    requestId: req.headers.get("x-request-id")?.trim() || undefined,
    searchParams: { user_id: session.user.id },
  });
  return conceptNoteRunResponse(response, session);
});
