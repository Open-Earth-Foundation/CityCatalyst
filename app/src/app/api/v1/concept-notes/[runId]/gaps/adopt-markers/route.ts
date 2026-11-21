/**
 * @swagger
 * /api/v1/concept-notes/{runId}/gaps/adopt-markers:
 *   post:
 *     operationId: adoptConceptNoteLegacyMarkerGaps
 *     summary: Track every unrecorded missing-information marker as a gap
 *     description: Creates the open gap record for each "[Information needed: …]" marker in the run's active chapters that has none (runs drafted before structured gaps), or returns the existing records. Markers with a record, including closed ones, are unchanged. The chapter text is unchanged. No body is accepted; the server reads the markers itself.
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
 *         description: The reloaded draft, including the new gap records
 *       400: { description: Missing or invalid run ID }
 *       401: { description: Authentication required }
 *       403: { description: City or run access denied }
 *       404: { description: Concept note run not found }
 */
import { z } from "zod";

import { proxyConceptNoteRunRequest } from "@/backend/concept-note-run-proxy";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ runId: z.string().uuid() });

export const POST = apiHandler(async (req, { session, params }) => {
  const { runId } = paramsSchema.parse(params);
  return proxyConceptNoteRunRequest(req, session, {
    runId,
    path: `/v1/concept-notes/${runId}/gaps/adopt-markers`,
    method: "POST",
  });
});
