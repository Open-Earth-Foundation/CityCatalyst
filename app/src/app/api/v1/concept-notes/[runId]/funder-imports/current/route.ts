/**
 * @swagger
 * /api/v1/concept-notes/{runId}/funder-imports/current:
 *   get:
 *     operationId: getConceptNoteFunderImport
 *     summary: Get the pending funder document import, with its draft when ready
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Current funder import, or null when none is pending }
 *       401: { description: Authentication required }
 *       403: { description: City or run access denied }
 *       404: { description: Concept note run not found }
 *   delete:
 *     operationId: discardConceptNoteFunderImport
 *     summary: Discard the pending funder document import
 *     description: The uploaded file stays a source of the note; the result of a running extraction is ignored.
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Import discarded }
 *       401: { description: Authentication required }
 *       403: { description: City or run access denied }
 *       404: { description: Concept note run not found }
 */
import { z } from "zod";

import { proxyConceptNoteRunRequest } from "@/backend/concept-note-run-proxy";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ runId: z.string().uuid() });

export const GET = apiHandler(async (req, { session, params }) => {
  const { runId } = paramsSchema.parse(params);
  return proxyConceptNoteRunRequest(req, session, {
    runId,
    path: `/v1/concept-notes/${runId}/funder-imports/current`,
  });
});

export const DELETE = apiHandler(async (req, { session, params }) => {
  const { runId } = paramsSchema.parse(params);
  return proxyConceptNoteRunRequest(req, session, {
    runId,
    path: `/v1/concept-notes/${runId}/funder-imports/current`,
    method: "DELETE",
  });
});
