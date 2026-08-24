/**
 * @swagger
 * /api/v1/concept-notes:
 *   get:
 *     operationId: listConceptNoteRuns
 *     summary: List the current user's Concept Note Builder runs for a city
 *     description: Returns only runs owned by the authenticated user for a city they can currently access.
 *     tags:
 *       - concept-notes
 *     parameters:
 *       - in: query
 *         name: city_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Authorized runs returned in most-recently-updated order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [runs]
 *               properties:
 *                 runs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required:
 *                       - run_id
 *                       - thread_id
 *                       - name
 *                       - city_id
 *                       - project_id
 *                       - funder_id
 *                       - selected_funding_opportunity_id
 *                       - status
 *                       - workflow_step
 *                       - progress_summary
 *                       - created_at
 *                       - updated_at
 *                     properties:
 *                       run_id:
 *                         type: string
 *                         format: uuid
 *                       thread_id:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                       name:
 *                         type: string
 *                       city_id:
 *                         type: string
 *                         format: uuid
 *                       project_id:
 *                         type: string
 *                         nullable: true
 *                       funder_id:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                       selected_funding_opportunity_id:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                       status:
 *                         type: string
 *                       workflow_step:
 *                         type: string
 *                       progress_summary:
 *                         type: object
 *                         additionalProperties: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: Invalid city identifier
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City access denied
 *       502:
 *         description: Climate Advisor returned an invalid run list
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

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });

const querySchema = z.object({ city_id: uuidSchema });

const runListItemSchema = z.object({
  run_id: uuidSchema,
  thread_id: uuidSchema.nullable(),
  name: z.string().min(1),
  city_id: uuidSchema,
  project_id: z.string().nullable(),
  funder_id: uuidSchema.nullable(),
  selected_funding_opportunity_id: uuidSchema.nullable(),
  status: z.string().min(1),
  workflow_step: z.string().min(1),
  progress_summary: z.record(z.string(), z.unknown()),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const runListSchema = z.object({
  runs: z.array(runListItemSchema),
});

export const GET = apiHandler(async (req, { session, searchParams }) => {
  const userId = session?.user?.id;
  if (!userId) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const { city_id: cityId } = querySchema.parse(searchParams);
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });

  const response = await callConceptNoteApi({
    path: "/v1/concept-notes",
    userId,
    requestId: req.headers.get("x-request-id")?.trim() || undefined,
    searchParams: {
      user_id: userId,
      city_id: cityId,
    },
  });
  const payload = await readConceptNoteApiPayload(response);

  if (!response.ok) {
    return NextResponse.json(payload, { status: response.status });
  }

  const runList = runListSchema.safeParse(payload);
  if (
    !runList.success ||
    runList.data.runs.some(
      (run) => run.city_id.toLowerCase() !== cityId.toLowerCase(),
    )
  ) {
    throw new createHttpError.BadGateway(
      "Climate Advisor returned an invalid concept-note run list",
    );
  }

  return NextResponse.json(runList.data);
});
