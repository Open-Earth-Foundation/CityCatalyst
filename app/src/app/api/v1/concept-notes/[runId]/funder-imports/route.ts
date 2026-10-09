/**
 * @swagger
 * /api/v1/concept-notes/{runId}/funder-imports:
 *   post:
 *     operationId: startConceptNoteFunderImport
 *     summary: Start reading funder, programme and template details from an upload
 *     description: The upload must belong to the run; the import waits for its conversion. Replaces any ready or failed import, so it also retries a failed read; read the result with GET funder-imports/current.
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [uploadId]
 *             properties:
 *               uploadId: { type: string, format: uuid }
 *     responses:
 *       202: { description: Import started; returns the current funder import }
 *       401: { description: Authentication required }
 *       403: { description: City or run access denied }
 *       404: { description: Upload not found on this run }
 *       409: { description: Another import is running }
 */
import { z } from "zod";

import { proxyConceptNoteRunRequest } from "@/backend/concept-note-run-proxy";
import { apiHandler } from "@/util/api";
import { conceptNoteFunderImportStartRequest } from "@/util/validation";

const paramsSchema = z.object({ runId: z.string().uuid() });

export const POST = apiHandler(async (req, { session, params }) => {
  const { runId } = paramsSchema.parse(params);
  const { uploadId } = conceptNoteFunderImportStartRequest.parse(
    await req.json(),
  );
  return proxyConceptNoteRunRequest(req, session, {
    runId,
    path: `/v1/concept-notes/${runId}/funder-imports`,
    method: "POST",
    body: { upload_id: uploadId },
  });
});
