import MeedApiService from "@/backend/MeedApiService";
import { PermissionService } from "@/backend/permissions";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import z from "zod";

/**
 * @swagger
 * /api/v1/city/{city}/meed/feasibility-scores:
 *   get:
 *     tags:
 *       - meed
 *       - city
 *     operationId: getMeedFeasibilityScores
 *     summary: Fetches MEED+ action mitigation feasibility scores
 *     description: Fetches MEED+ action mitigation feasibility scores for the given city via the MEED service from the global API
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Feasibility scores retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     locode:
 *                       type: string
 *                     country_code:
 *                       type: string
 *                     scores:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           action_id:
 *                             type: string
 *                           action_score:
 *                             type: number
 *                           rank_within_city:
 *                             type: number
 *                           dimension_scores:
 *                             type: object
 *                             additionalProperties:
 *                               type: number
 */
const getFeasibilityScoresParams = z.object({
  city: z.string().uuid(),
});
export const GET = apiHandler(async (_req, { session, params }) => {
  const { city: cityId } = getFeasibilityScoresParams.parse(params);
  await PermissionService.canAccessCity(session, cityId);
  const result = await MeedApiService.getFeasibilityScores(cityId);
  return NextResponse.json({ data: result });
});
