/**
 * @swagger
 * components:
 *   parameters:
 *     CnbEditRunId:
 *       in: "path"
 *       name: "runId"
 *       required: true
 *       description: "Concept Note run owned by the authenticated user, with current access to its city."
 *       schema:
 *         type: "string"
 *         format: "uuid"
 *     CnbEditProposalId:
 *       in: "path"
 *       name: "proposalId"
 *       required: true
 *       description: "Proposal UUID bound to this run and owner."
 *       schema:
 *         type: "string"
 *         format: "uuid"
 *   responses:
 *     CnbEditBadRequest:
 *       description: "Malformed path, query or request payload; no draft mutation."
 *     CnbEditUnauthorized:
 *       description: "A current CityCatalyst session or supported bearer token is required."
 *     CnbEditForbidden:
 *       description: "The authenticated user lacks current access to the run or city."
 *     CnbEditNotFound:
 *       description: "The requested run or proposal is unavailable to this user."
 *     CnbEditConflict:
 *       description: "Stale revision/source, inactive run, locked chapter, incompatible proposal state, or conflicting idempotency key. No partial chapter writes."
 *     CnbEditUnprocessable:
 *       description: "Invalid scope, unsupported evidence, unknown selection or other semantic validation failure; no draft mutation."
 *     CnbEditUnavailable:
 *       description: "Concept Note edit storage or service is unavailable; retry without changing the idempotency key for the same decision."
 *     CnbEditUpstreamError:
 *       description: "The upstream Concept Note service could not complete the request."
 *   schemas:
 *     CnbEditRevisionVector:
 *       type: "object"
 *       description: "Chapter UUID keys mapped to exact positive revision numbers. A processing proposal may have an empty base vector."
 *       maxProperties: 100
 *       additionalProperties:
 *         type: "integer"
 *         minimum: 1
 *     CnbEditScope:
 *       type: "object"
 *       additionalProperties: false
 *       properties:
 *         kind:
 *           type: "string"
 *           enum: ["auto"]
 *           default: "auto"
 *         focused_chapter_id:
 *           type: "string"
 *           format: "uuid"
 *           nullable: true
 *       description: "Scope is always selected automatically from the instruction and complete draft. focused_chapter_id is a non-binding navigation hint, never a restriction."
 *     CnbEditProposalRequest:
 *       type: "object"
 *       additionalProperties: false
 *       required: ["instruction","scope","idempotency_key"]
 *       properties:
 *         instruction:
 *           type: "string"
 *           minLength: 1
 *           maxLength: 8000
 *           pattern: "\\S"
 *         scope:
 *           $ref: "#/components/schemas/CnbEditScope"
 *         idempotency_key:
 *           type: "string"
 *           format: "uuid"
 *         refines_proposal_id:
 *           type: "string"
 *           format: "uuid"
 *           nullable: true
 *           description: "Optional prior proposal in this run. On the refine endpoint it must match proposalId."
 *     CnbEditApplyRequest:
 *       type: "object"
 *       additionalProperties: false
 *       required: ["idempotency_key","expected_revisions"]
 *       properties:
 *         idempotency_key:
 *           type: "string"
 *           format: "uuid"
 *         expected_revisions:
 *           type: "object"
 *           allOf:
 *             - $ref: "#/components/schemas/CnbEditRevisionVector"
 *           description: "Send the complete proposal base_revisions unchanged, not only selected chapters."
 *           minProperties: 1
 *           maxProperties: 100
 *         selected_change_ids:
 *           type: "array"
 *           nullable: true
 *           items:
 *             type: "string"
 *             format: "uuid"
 *           minItems: 1
 *           maxItems: 100
 *           uniqueItems: true
 *           description: "Omit or use null to accept all changes. A non-empty subset applies the reviewer's exact per-change decisions."
 *     CnbEditSourceSnapshot:
 *       type: "object"
 *       additionalProperties: false
 *       required: ["upload_id","source_label","sha256"]
 *       properties:
 *         upload_id:
 *           type: "string"
 *           format: "uuid"
 *         source_label:
 *           type: "string"
 *         sha256:
 *           type: "string"
 *           pattern: "^[0-9a-f]{64}$"
 *     CnbEditChange:
 *       type: "object"
 *       additionalProperties: false
 *       required: ["change_id","chapter_id","chapter_title","base_revision","start","before","after","kind","group_id","source_refs","user_input_quote","source_snapshots"]
 *       properties:
 *         change_id:
 *           type: "string"
 *           format: "uuid"
 *         chapter_id:
 *           type: "string"
 *           format: "uuid"
 *         chapter_title:
 *           type: "string"
 *         base_revision:
 *           type: "integer"
 *           minimum: 1
 *         start:
 *           type: "integer"
 *           minimum: 0
 *           maximum: 50000
 *           description: "Zero-based offset into exact current Markdown."
 *         before:
 *           type: "string"
 *           minLength: 1
 *           maxLength: 50000
 *         after:
 *           type: "string"
 *           maxLength: 50000
 *         kind:
 *           type: "string"
 *           enum: ["wording","factual"]
 *         group_id:
 *           type: "string"
 *           pattern: "^[a-zA-Z0-9_-]{1,80}$"
 *           description: "Related occurrences share a group for bulk review, while the reviewer may still decide each inline change explicitly."
 *         source_refs:
 *           type: "array"
 *           items:
 *             type: "string"
 *           maxItems: 20
 *         user_input_quote:
 *           type: "string"
 *           nullable: true
 *           maxLength: 8000
 *         source_snapshots:
 *           type: "array"
 *           items:
 *             $ref: "#/components/schemas/CnbEditSourceSnapshot"
 *     CnbEditApplicationResult:
 *       type: "object"
 *       nullable: true
 *       additionalProperties: false
 *       required: ["application_id","accepted_change_ids","revisions"]
 *       properties:
 *         application_id:
 *           type: "string"
 *           format: "uuid"
 *         accepted_change_ids:
 *           type: "array"
 *           items:
 *             type: "string"
 *             format: "uuid"
 *         revisions:
 *           allOf:
 *             - $ref: "#/components/schemas/CnbEditRevisionVector"
 *           description: "Only chapters actually written by this accepted batch."
 *     CnbEditProposal:
 *       type: "object"
 *       additionalProperties: false
 *       required: ["proposal_id","run_id","instruction","scope","status","base_revisions","changes","clarification","error_code","result","created_at","updated_at"]
 *       properties:
 *         proposal_id:
 *           type: "string"
 *           format: "uuid"
 *         run_id:
 *           type: "string"
 *           format: "uuid"
 *         instruction:
 *           type: "string"
 *         scope:
 *           $ref: "#/components/schemas/CnbEditScope"
 *         status:
 *           type: "string"
 *           enum: ["processing","clarification_required","proposed","applied","partially_applied","rejected","failed","stale"]
 *         base_revisions:
 *           $ref: "#/components/schemas/CnbEditRevisionVector"
 *         changes:
 *           type: "array"
 *           items:
 *             $ref: "#/components/schemas/CnbEditChange"
 *         clarification:
 *           type: "string"
 *           nullable: true
 *         error_code:
 *           type: "string"
 *           nullable: true
 *         result:
 *           $ref: "#/components/schemas/CnbEditApplicationResult"
 *         created_at:
 *           type: "string"
 *           format: "date-time"
 *         updated_at:
 *           type: "string"
 *           format: "date-time"
 * /api/v1/concept-notes/{runId}/edit-proposals:
 *   parameters:
 *     - $ref: "#/components/parameters/CnbEditRunId"
 *   get:
 *     operationId: "listConceptNoteEditProposals"
 *     summary: "Restore authorized edit proposal review state"
 *     description: "Returns the newest 100 proposals plus every older actionable proposal, in newest-first order. Pending reviews and recoverable failures are not hidden by recent history. Draft text is unchanged. Ownership and city access are checked on every call."
 *     tags: ["concept-notes"]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: "Durable proposal states, including recoverable processing, clarification, failure and completed decisions."
 *         content:
 *           application/json:
 *             schema:
 *               type: "array"
 *               items:
 *                 $ref: "#/components/schemas/CnbEditProposal"
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
 *   post:
 *     operationId: "proposeConceptNoteEdit"
 *     summary: "Propose an edit without changing the draft"
 *     description: "Creates or replays a proposal. Inspect status and error_code: HTTP 202 is not acceptance of the edits. The user must separately apply the exact reviewable changes. Reusing a key with different content conflicts. Ownership and city access are checked on every call."
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
 *         description: "Durable proposal, focused clarification, or recoverable failed status."
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

export const GET = apiHandler((request, context) =>
  forwardConceptNoteEdit(request, context, "list"),
);
export const POST = apiHandler((request, context) =>
  forwardConceptNoteEdit(request, context, "propose"),
);
