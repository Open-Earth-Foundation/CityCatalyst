/**
 * @swagger
 * /api/v1/concept-notes/{runId}/points/{pointKey}/question:
 *   post:
 *     operationId: guideDocumentPoint
 *     summary: Explain a point and generate its grounded question
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
 *       200: { description: Question and choices without changing the answer }
 */
import { forwardDocumentWorkspace } from "@/backend/document-workspace-api";
import { apiHandler } from "@/util/api";

export const POST = apiHandler((request, context) =>
  forwardDocumentWorkspace(request, context, "question"),
);
