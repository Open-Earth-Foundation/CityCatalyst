/**
 * @swagger
 * /api/v1/concept-notes/{runId}/revisions/{revisionId}/undo:
 *   parameters:
 *     - $ref: "#/components/parameters/CnbEditRunId"
 *     - $ref: "#/components/parameters/CnbEditRevisionId"
 *   post:
 *     operationId: "undoConceptNoteEditHistory"
 *     summary: "Append a safe compensating revision for the latest edit batch"
 *     description: "Only the latest history batch can be undone. Submit the exact current vector reviewed by the user; newer chapter work must not be overwritten. Creates new revisions, preserves history, and replays the original result for an identical key and body. Requires the existing CityCatalyst browser session or supported bearer authentication; ownership and city access are checked on every call."
 *     tags: ["concept-notes"]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CnbEditHistoryRequest"
 *     responses:
 *       200:
 *         description: "Persisted undo batch or identical replay."
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
 *       409:
 *         $ref: "#/components/responses/CnbEditConflict"
 *       422:
 *         $ref: "#/components/responses/CnbEditUnprocessable"
 *       502:
 *         $ref: "#/components/responses/CnbEditUpstreamError"
 *       503:
 *         $ref: "#/components/responses/CnbEditUnavailable"
 */
import { forwardConceptNoteEdit } from "@/backend/concept-note-edits";
import { apiHandler } from "@/util/api";

export const POST = apiHandler((request, context) =>
  forwardConceptNoteEdit(request, context, "undo"),
);
