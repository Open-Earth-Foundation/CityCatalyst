/**
 * @swagger
 * /api/v1/concept-notes/{runId}/events:
 *   get:
 *     operationId: observeConceptNoteWorkspace
 *     summary: Observe active Concept Note workspace resources
 *     description: Streams changed run, draft, and upload snapshots and closes when all selected resources are terminal.
 *     tags:
 *       - concept-notes
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: resources
 *         required: true
 *         schema:
 *           type: string
 *           example: run,draft,upload
 *       - in: query
 *         name: upload_id
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Snapshot-first server-sent event stream
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         description: Invalid resource selection
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City or run access denied
 */
import createHttpError from "http-errors";
import { z } from "zod";

import { loadConceptNoteRunCity } from "@/backend/ConceptNoteUploadService";
import {
  createConceptNoteWorkspaceEventStream,
  type ConceptNoteWorkspaceResource,
} from "@/backend/ConceptNoteWorkspaceObserver";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ runId: z.string().uuid() });
const querySchema = z.object({
  resources: z.string().min(1),
  upload_id: z.string().uuid().optional(),
});
const allowedResources = new Set<ConceptNoteWorkspaceResource>([
  "run",
  "draft",
  "upload",
]);

export const GET = apiHandler(
  async (req, { session, params, searchParams }) => {
    if (!session?.user?.id) {
      throw new createHttpError.Unauthorized("Authentication required");
    }

    const { runId } = paramsSchema.parse(params);
    const query = querySchema.parse(searchParams);
    const selected = query.resources.split(",").filter(Boolean);
    if (
      selected.length === 0 ||
      selected.some(
        (resource) =>
          !allowedResources.has(resource as ConceptNoteWorkspaceResource),
      ) ||
      (selected.includes("upload") && !query.upload_id)
    ) {
      throw new createHttpError.BadRequest("Invalid workspace resources");
    }

    const userId = session.user.id;
    const requestId = req.headers.get("x-request-id")?.trim() || undefined;
    const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
    await PermissionService.canAccessCity(session, cityId, {
      includeResource: false,
    });

    const resources = new Set(selected as ConceptNoteWorkspaceResource[]);
    const stream = createConceptNoteWorkspaceEventStream({
      runId,
      userId,
      resources,
      uploadId: query.upload_id,
      requestId,
      signal: req.signal,
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      },
    });
  },
);
