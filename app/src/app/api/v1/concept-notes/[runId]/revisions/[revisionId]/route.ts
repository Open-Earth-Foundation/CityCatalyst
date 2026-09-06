/**
 * @swagger
 * /api/v1/concept-notes/{runId}/revisions/{revisionId}:
 *   parameters:
 *     - $ref: "#/components/parameters/CnbEditRunId"
 *     - $ref: "#/components/parameters/CnbEditRevisionId"
 *   get:
 *     operationId: "getConceptNoteEditHistory"
 *     summary: "Inspect immutable before and after chapter snapshots"
 *     description: "Loads exact stored chapter snapshots for review; the history batch does not itself change current content. Requires the existing CityCatalyst browser session or supported bearer authentication; ownership and city access are checked on every call."
 *     tags: ["concept-notes"]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: "Authorized historical chapter content."
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/CnbEditHistoryEntry"
 *       400:
 *         $ref: "#/components/responses/CnbEditBadRequest"
 *       401:
 *         $ref: "#/components/responses/CnbEditUnauthorized"
 *       403:
 *         $ref: "#/components/responses/CnbEditForbidden"
 *       404:
 *         $ref: "#/components/responses/CnbEditNotFound"
 *       502:
 *         $ref: "#/components/responses/CnbEditUpstreamError"
 *       503:
 *         $ref: "#/components/responses/CnbEditUnavailable"
 */
import { forwardConceptNoteEdit } from "@/backend/concept-note-edits";
import { apiHandler } from "@/util/api";

export const GET = apiHandler((request, context) =>
  forwardConceptNoteEdit(request, context, "revision"),
);
