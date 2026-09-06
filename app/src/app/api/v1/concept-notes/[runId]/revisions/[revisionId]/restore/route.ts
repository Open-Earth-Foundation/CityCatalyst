/**
 * @swagger
 * /api/v1/concept-notes/{runId}/revisions/{revisionId}/restore:
 *   parameters:
 *     - $ref: "#/components/parameters/CnbEditRunId"
 *     - $ref: "#/components/parameters/CnbEditRevisionId"
 *   post:
 *     operationId: "restoreConceptNoteEditHistory"
 *     summary: "Restore reviewed historical text through new revision records"
 *     description: "Restores the selected batch's after snapshots against the exact current vector reviewed by the user. Creates compensating revisions without deleting later history; an identical key and body replay the same result. Requires the existing CityCatalyst browser session or supported bearer authentication; ownership and city access are checked on every call."
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
 *         description: "Persisted restoration batch or identical replay."
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
  forwardConceptNoteEdit(request, context, "restore"),
);
