/**
 * @swagger
 * /api/v1/concept-notes/{runId}/points/{pointKey}/commands:
 *   post:
 *     operationId: commandDocumentPoint
 *     summary: Apply one explicit version-checked point decision
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: pointKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Saved point or identical command replay }
 *       409: { description: Stale point or conflicting idempotency key }
 */
import { forwardDocumentWorkspace } from "@/backend/document-workspace-api";
import { apiHandler } from "@/util/api";

export const POST = apiHandler((request, context) =>
  forwardDocumentWorkspace(request, context, "commands"),
);
