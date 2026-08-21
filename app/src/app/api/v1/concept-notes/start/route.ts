/**
 * @swagger
 * /api/v1/concept-notes/start:
 *   post:
 *     operationId: startConceptNoteRun
 *     summary: Create or replay a Concept Note Builder run
 *     tags:
 *       - concept-notes
 *     responses:
 *       201:
 *         description: Run created
 *       200:
 *         description: Identical idempotent request replayed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City access denied
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

import {
  callConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";
import { conceptNoteStartRequest } from "@/util/validation";

export const POST = apiHandler(async (req, { session }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const body = conceptNoteStartRequest.parse(await req.json());
  await PermissionService.canAccessCity(session, body.city_id, {
    includeResource: false,
  });

  const response = await callConceptNoteApi({
    path: "/v1/concept-notes/start",
    method: "POST",
    userId: session.user.id,
    requestId: req.headers.get("x-request-id")?.trim() || undefined,
    body: {
      ...body,
      user_id: session.user.id,
    },
  });
  const payload = await readConceptNoteApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
});
