/**
 * @swagger
 * /api/v1/concept-notes/{runId}/edit-proposals/{proposalId}/reject:
 *   parameters:
 *     - $ref: "#/components/parameters/CnbEditRunId"
 *     - $ref: "#/components/parameters/CnbEditProposalId"
 *   post:
 *     operationId: "rejectConceptNoteEditProposal"
 *     summary: "Reject or cancel a proposal without changing the draft"
 *     description: "Idempotently rejects a pending proposal or cancels processing. No body is required and no chapter revision is written. Requires the existing CityCatalyst browser session or supported bearer authentication; ownership and city access are checked on every call."
 *     tags: ["concept-notes"]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: "Durable rejected proposal."
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
  forwardConceptNoteEdit(request, context, "reject"),
);
