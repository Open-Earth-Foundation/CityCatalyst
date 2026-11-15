/**
 * @swagger
 * /api/v1/concept-notes/{runId}/workspace:
 *   get:
 *     operationId: getDocumentWorkspace
 *     summary: Read authorized points, source needs and document readiness
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Current document workspace }
 *       401: { description: Authentication required }
 *       404: { description: Run not found or feature unavailable }
 */
import { forwardDocumentWorkspace } from "@/backend/document-workspace-api";
import { apiHandler } from "@/util/api";

export const GET = apiHandler((request, context) =>
  forwardDocumentWorkspace(request, context, "workspace"),
);
