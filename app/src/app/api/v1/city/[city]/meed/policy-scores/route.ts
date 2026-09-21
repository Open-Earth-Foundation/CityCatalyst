import MeedApiService from "@/backend/MeedApiService";
import { PermissionService } from "@/backend/permissions";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import z from "zod";

/**
 * @swagger
 * /api/v1/city/{city}/meed/policy-scores:
 *   get:
 *     tags:
 *       - meed
 *       - city
 *     operationId: getMeedPolicyScores
 *     summary: Fetches MEED+ policy scores
 *     description: Fetches MEED+ policy scores for the given city via the MEED service from the global API
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Policy scores retrieved
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
 *                     scores:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           action_id:
 *                             type: string
 *                           policy_support_score:
 *                             type: number
 *                           policy_support_category:
 *                             type: string
 *                           finding_count:
 *                             type: number
 *                           document_count:
 *                             type: number
 *                           policy_evidence:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 document_type:
 *                                   type: string
 *                                 scope:
 *                                   type: string
 *                                 document_name:
 *                                   type: string
 *                                 signal_type:
 *                                   type: string
 *                                 signal_relation:
 *                                   type: string
 *                                 signal_strength:
 *                                   type: string
 *                                 doc_relevance:
 *                                   type: string
 *                                 evidence_strength:
 *                                   type: number
 */
const getPolicyScoresParams = z.object({
  city: z.string().uuid(),
});
export const GET = apiHandler(async (_req, { session, params }) => {
  const { city: cityId } = getPolicyScoresParams.parse(params);
  await PermissionService.canAccessCity(session, cityId);
  const result = await MeedApiService.getPolicyScores(cityId);
  return NextResponse.json({ data: result });
});
