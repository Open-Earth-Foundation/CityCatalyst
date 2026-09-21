/**
 * @swagger
 * /api/v1/concept-notes/{runId}/edit-proposals/{proposalId}/refine:
 *   parameters:
 *     - $ref: "#/components/parameters/CnbEditRunId"
 *     - $ref: "#/components/parameters/CnbEditProposalId"
 *   post:
 *     operationId: "refineConceptNoteEditProposal"
 *     summary: "Create a separately reviewable proposal refinement"
 *     description: "Carries the prior instruction and proposed changes as context, while anchoring against the current draft. A successfully proposed replacement rejects the prior pending proposal; a failed refinement leaves that prior proposal available. Never applies changes. Requires the existing CityCatalyst browser session or supported bearer authentication; ownership and city access are checked on every call."
 *     tags: ["concept-notes"]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CnbEditProposalRequest"
 *     responses:
 *       202:
 *         description: "Refined proposal, focused clarification, or recoverable failed status."
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
  forwardConceptNoteEdit(request, context, "refine"),
);
