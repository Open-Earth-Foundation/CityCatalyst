/**
 * @swagger
 * /api/v1/concept-notes/{runId}:
 *   get:
 *     operationId: getConceptNoteRun
 *     summary: Get an authorized Concept Note Builder run
 *     tags:
 *       - concept-notes
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Run returned
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City access denied
 *       404:
 *         description: Run not found
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  callConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({
  runId: z.string().uuid(),
});

const upstreamRunSchema = z.object({
  city_id: z.string().uuid(),
});

export const GET = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const { runId } = paramsSchema.parse(params);
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}`,
    userId: session.user.id,
    requestId: req.headers.get("x-request-id")?.trim() || undefined,
    searchParams: { user_id: session.user.id },
  });
  const payload = await readConceptNoteApiPayload(response);

  if (response.ok) {
    const run = upstreamRunSchema.safeParse(payload);
    if (!run.success) {
      throw new createHttpError.BadGateway(
        "Climate Advisor returned an invalid concept-note run",
      );
    }
    await PermissionService.canAccessCity(session, run.data.city_id, {
      includeResource: false,
    });
  }

  return NextResponse.json(payload, { status: response.status });
});
