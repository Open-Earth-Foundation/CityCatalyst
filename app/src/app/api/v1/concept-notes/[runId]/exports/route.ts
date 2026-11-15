/**
 * @swagger
 * /api/v1/concept-notes/{runId}/exports:
 *   post:
 *     operationId: exportDocumentWorkspace
 *     summary: Create a server-validated working or final document snapshot
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Authorized immutable export snapshot }
 *       409: { description: Workspace revision changed or final requirements unmet }
 */
import { forwardDocumentWorkspace } from "@/backend/document-workspace-api";
import { apiHandler } from "@/util/api";

export const POST = apiHandler((request, context) =>
  forwardDocumentWorkspace(request, context, "exports"),
);
