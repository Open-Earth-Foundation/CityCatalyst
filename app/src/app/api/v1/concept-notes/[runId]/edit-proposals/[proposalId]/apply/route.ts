/**
 * @swagger
 * /api/v1/concept-notes/{runId}/edit-proposals/{proposalId}/apply:
 *   parameters:
 *     - $ref: "#/components/parameters/CnbEditRunId"
 *     - $ref: "#/components/parameters/CnbEditProposalId"
 *   post:
 *     operationId: "applyConceptNoteEditProposal"
 *     summary: "Explicitly accept a version-bound edit proposal"
 *     description: "Applies all changes or the reviewer's exact non-empty selection atomically. Send the proposal's entire base_revisions vector. Exact retries return the original application result; rejected, stale, or unknown selections cannot mutate the draft. Requires the existing CityCatalyst browser session or supported bearer authentication; ownership and city access are checked on every call."
 *     tags: ["concept-notes"]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CnbEditApplyRequest"
 *     responses:
 *       200:
 *         description: "Applied or partially_applied proposal with its persisted acceptance result, or identical replay."
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/CnbEditProposal"
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
  forwardConceptNoteEdit(request, context, "apply"),
);
