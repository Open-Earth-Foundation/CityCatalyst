/**
 * @swagger
 * /api/v1/concept-notes/{runId}/edit-proposals/{proposalId}:
 *   parameters:
 *     - $ref: "#/components/parameters/CnbEditRunId"
 *     - $ref: "#/components/parameters/CnbEditProposalId"
 *   get:
 *     operationId: "getConceptNoteEditProposal"
 *     summary: "Read an authorized proposal and complete diff"
 *     description: "Reads persisted review state without changing current document content. Requires the existing CityCatalyst browser session or supported bearer authentication; ownership and city access are checked on every call."
 *     tags: ["concept-notes"]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: "Proposal bound to the run and authenticated owner."
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
 *       502:
 *         $ref: "#/components/responses/CnbEditUpstreamError"
 *       503:
 *         $ref: "#/components/responses/CnbEditUnavailable"
 */
import { forwardConceptNoteEdit } from "@/backend/concept-note-edits";
import { apiHandler } from "@/util/api";

export const GET = apiHandler((request, context) =>
  forwardConceptNoteEdit(request, context, "read"),
);
