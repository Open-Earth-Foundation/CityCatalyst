/**
 * @swagger
 * /api/v1/concept-notes/{runId}:
 *   parameters:
 *     - in: path
 *       name: runId
 *       required: true
 *       schema:
 *         type: string
 *         format: uuid
 *     - in: query
 *       name: city_id
 *       required: true
 *       schema:
 *         type: string
 *         format: uuid
 *   get:
 *     operationId: getConceptNoteRun
 *     summary: Get an authorized Concept Note Builder run
 *     tags:
 *       - concept-notes
 *     responses:
 *       200:
 *         description: Run returned
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City access denied
 *       404:
 *         description: Run not found
 *   patch:
 *     operationId: renameConceptNoteRun
 *     summary: Rename an authorized Concept Note Builder run
 *     tags:
 *       - concept-notes
 *     responses:
 *       200:
 *         description: Run renamed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City access denied
 *       404:
 *         description: Run not found
 *   delete:
 *     operationId: deleteConceptNoteRun
 *     summary: Permanently delete an authorized Concept Note Builder run
 *     tags:
 *       - concept-notes
 *     responses:
 *       204:
 *         description: Run deleted
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
  callAuthorizedConceptNoteApi,
  conceptNoteRunResponse,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({
  runId: z.string().uuid(),
});
const querySchema = z.object({ city_id: z.string().uuid() });

const renameSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const GET = apiHandler(
  async (req, { session, params, searchParams }) => {
    if (!session?.user?.id) {
      throw new createHttpError.Unauthorized("Authentication required");
    }

    const { runId } = paramsSchema.parse(params);
    const { city_id: cityId } = querySchema.parse(searchParams);
    const response = await callAuthorizedConceptNoteApi({
      cityId,
      path: `/v1/concept-notes/${runId}`,
      requestId: req.headers.get("x-request-id")?.trim() || undefined,
      searchParams: { user_id: session.user.id },
      session,
    });
    return conceptNoteRunResponse(response, cityId);
  },
);

export const PATCH = apiHandler(
  async (req, { session, params, searchParams }) => {
    if (!session?.user?.id) {
      throw new createHttpError.Unauthorized("Authentication required");
    }
    const { runId } = paramsSchema.parse(params);
    const { city_id: cityId } = querySchema.parse(searchParams);
    const body = renameSchema.parse(await req.json());
    const response = await callAuthorizedConceptNoteApi({
      cityId,
      path: `/v1/concept-notes/${runId}`,
      method: "PATCH",
      body,
      requestId: req.headers.get("x-request-id")?.trim() || undefined,
      searchParams: { user_id: session.user.id },
      session,
    });
    return conceptNoteRunResponse(response, cityId);
  },
);

export const DELETE = apiHandler(
  async (req, { session, params, searchParams }) => {
    if (!session?.user?.id) {
      throw new createHttpError.Unauthorized("Authentication required");
    }
    const { runId } = paramsSchema.parse(params);
    const { city_id: cityId } = querySchema.parse(searchParams);
    const response = await callAuthorizedConceptNoteApi({
      cityId,
      path: `/v1/concept-notes/${runId}`,
      method: "DELETE",
      requestId: req.headers.get("x-request-id")?.trim() || undefined,
      searchParams: { user_id: session.user.id },
      session,
    });
    if (response.status === 204) {
      return new Response(null, { status: 204 });
    }
    const payload = await readConceptNoteApiPayload(response);
    return NextResponse.json(payload, { status: response.status });
  },
);
