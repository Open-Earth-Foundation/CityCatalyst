/**
 * @swagger
 * /api/v1/concept-notes/{runId}/setup:
 *   put:
 *     operationId: configureDocumentWorkspace
 *     summary: Compile the selected template into versioned document points
 *     tags: [concept-notes]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Setup and points reconciled }
 *       409: { description: Workspace changed since it was read }
 */
import { forwardDocumentWorkspace } from "@/backend/document-workspace-api";
import { apiHandler } from "@/util/api";

export const PUT = apiHandler((request, context) =>
  forwardDocumentWorkspace(request, context, "setup"),
);
