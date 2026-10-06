/**
 * @swagger
 * /api/v1/internal/ca/concept-note-sources:
 *   delete:
 *     operationId: deleteInternalConceptNoteSources
 *     summary: Delete unreferenced Concept Note uploads and OCR artifacts
 *     tags: [internal]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [upload_ids]
 *             properties:
 *               upload_ids:
 *                 type: array
 *                 items: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Sources deleted
 *       401:
 *         description: CA service authentication required
 *       409:
 *         description: Source processing is still active
 */
import createHttpError from "http-errors";
import { z } from "zod";
import { deleteConceptNoteSources } from "@/backend/ConceptNoteDeletionService";
import { apiHandler } from "@/util/api";

const bodySchema = z.object({
  upload_ids: z.array(z.string().uuid()).min(1).max(1000),
});

export const DELETE = apiHandler(
  async (req) => {
    const { upload_ids } = bodySchema.parse(await req.json());
    await deleteConceptNoteSources([...new Set(upload_ids)]);
    return new Response(null, { status: 204 });
  },
  {
    authenticateRequest: (req) => {
      const key = req.headers.get("X-CA-Service-Key");
      if (!key || key !== process.env.CC_SERVICE_API_KEY) {
        throw new createHttpError.Unauthorized(
          "CA service authentication required",
        );
      }
      return null;
    },
  },
);
