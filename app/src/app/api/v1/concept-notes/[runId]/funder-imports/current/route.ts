/**
 * @swagger
 * /api/v1/concept-notes/{runId}/funder-imports/current:
 *   get:
 *     operationId: getConceptNoteFunderImport
 *     summary: Get the pending funder document import, with its draft when ready
 *     description: Returns null when the run has no pending import. Poll while the status is processing.
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Current funder import, or null when none is pending" }
 *       401: { description: Authentication required }
 *       403: { description: City or run access denied }
 *       404: { description: Concept note run not found }
 *   delete:
 *     operationId: discardConceptNoteFunderImport
 *     summary: Discard the pending funder document import
 *     description: Discards only the specified import, preserving concurrent replacements. The uploaded file stays a source of the note.
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: importId
 *         required: true
 *         description: The observed import ID; a newer replacement is preserved.
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Import discarded }
 *       400: { description: Missing or invalid import ID }
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
  const { importId } = z
    .object({ importId: z.string().uuid() })
    .parse({ importId: new URL(req.url).searchParams.get("importId") });
  return proxyConceptNoteRunRequest(req, session, {
    runId,
    path: `/v1/concept-notes/${runId}/funder-imports/current`,
    method: "DELETE",
    searchParams: { import_id: importId },
  });
});
