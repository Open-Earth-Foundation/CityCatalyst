/**
 * @swagger
 * /api/v1/concept-notes/{runId}/revisions:
 *   parameters:
 *     - $ref: "#/components/parameters/CnbEditRunId"
 *     - in: "query"
 *       name: "before_sequence"
 *       required: false
 *       description: "Exclusive descending history cursor. Omit for the latest 50 entries."
 *       schema:
 *         type: "integer"
 *         minimum: 1
 *         maximum: 2147483647
 *   get:
 *     operationId: "listConceptNoteEditHistory"
 *     summary: "Read ordered authorized edit history"
 *     description: "Returns up to 50 compact append-only batches in descending sequence order. Full chapter content is obtained from the detail endpoint. Requires the existing CityCatalyst browser session or supported bearer authentication; ownership and city access are checked on every call."
 *     tags: ["concept-notes"]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: "Immutable revision batch metadata."
 *         content:
 *           application/json:
 *             schema:
 *               type: "array"
 *               maxItems: 50
 *               items:
 *                 $ref: "#/components/schemas/CnbEditHistoryEntry"
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
  forwardConceptNoteEdit(request, context, "history"),
);
