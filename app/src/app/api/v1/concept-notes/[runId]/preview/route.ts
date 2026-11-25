/**
 * @swagger
 * /api/v1/concept-notes/{runId}/preview:
 *   get:
 *     operationId: previewConceptNote
 *     summary: Read-only preview of a Concept Note for a city collaborator
 *     description: >
 *       Returns the note's chapters, saved gap answers and its author's edit
 *       proposals, including which changes were applied. Requires current access
 *       to the city and an active Concept Note Builder module for its project.
 *       Every write route stays limited to the note's author.
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
 *         name: city_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Preview returned
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City access denied
 *       404:
 *         description: Note not found, in another city, or the module is not active
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ModuleAccessService } from "@/backend/ModuleAccessService";
import {
  callConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import { PermissionService } from "@/backend/permissions/PermissionService";
import type { City } from "@/models/City";
import { apiHandler } from "@/util/api";
import { Modules } from "@/util/constants";

const paramsSchema = z.object({ runId: z.string().uuid() });
const querySchema = z.object({ city_id: z.string().uuid() });
const publicErrorSchema = z.object({
  detail: z.union([
    z.string(),
    z.object({
      code: z.string(),
      message: z.string().optional().catch(undefined),
    }),
  ]),
});

export const GET = apiHandler(
  async (req, { session, params, searchParams }) => {
    if (!session?.user?.id) {
      throw new createHttpError.Unauthorized("Authentication required");
    }
    const { runId } = paramsSchema.parse(params);
    const { city_id: cityId } = querySchema.parse(searchParams);

    const access = await PermissionService.canAccessCity(session, cityId);
    const projectId = (access.resource as City | undefined)?.projectId;
    if (
      !projectId ||
      !(await ModuleAccessService.hasModuleAccess(
        projectId,
        Modules.CONCEPT_NOTE_BUILDER.id,
      ))
    ) {
      throw new createHttpError.NotFound("Concept Note not found");
    }

    // Climate Advisor rechecks city access and that the note belongs to this city.
    const response = await callConceptNoteApi({
      path: `/v1/concept-notes/${runId}/preview`,
      userId: session.user.id,
      requestId: req.headers.get("x-request-id")?.trim() || undefined,
      searchParams: { user_id: session.user.id, city_id: cityId },
    });
    const payload = await readConceptNoteApiPayload(response);
    if (!response.ok) {
      const error = publicErrorSchema.safeParse(payload);
      return NextResponse.json(
        { detail: error.success ? error.data.detail : "" },
        { status: response.status },
      );
    }
    return NextResponse.json(payload);
  },
);
