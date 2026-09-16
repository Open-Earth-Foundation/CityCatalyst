/**
 * @swagger
 * /api/v1/concept-notes/{runId}/population:
 *   patch:
 *     operationId: updateConceptNotePopulation
 *     summary: Set or clear population supplied for one concept note only
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
 *         description: Concept note population updated
 *       400:
 *         description: Invalid population or year
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City access denied
 *       404:
 *         description: Run not found
 */
import createHttpError from "http-errors";
import { z } from "zod";

import {
  callAuthorizedConceptNoteApi,
  conceptNoteRunResponse,
} from "@/backend/concept-notes";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ runId: z.string().uuid() });
const querySchema = z.object({ city_id: z.string().uuid() });
const bodySchema = z.object({
  manual_population: z
    .object({
      population: z.number().int().min(0).max(10_000_000_000),
      year: z.number().int().min(1800).max(2100),
    })
    .nullable(),
});

export const PATCH = apiHandler(
  async (req, { session, params, searchParams }) => {
    if (!session?.user?.id) {
      throw new createHttpError.Unauthorized("Authentication required");
    }
    const { runId } = paramsSchema.parse(params);
    const { city_id: cityId } = querySchema.parse(searchParams);
    const body = bodySchema.parse(await req.json());
    const response = await callAuthorizedConceptNoteApi({
      cityId,
      path: `/v1/concept-notes/${runId}/population`,
      method: "PATCH",
      body,
      requestId: req.headers.get("x-request-id")?.trim() || undefined,
      searchParams: { user_id: session.user.id },
      session,
    });
    return conceptNoteRunResponse(response, cityId);
  },
);
