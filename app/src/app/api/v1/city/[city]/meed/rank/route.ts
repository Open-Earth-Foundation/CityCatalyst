import MeedApiService from "@/backend/MeedApiService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import z from "zod";

/**
 * @swagger
 * /api/v1/city/{city}/meed/rank:
 *   post:
 *     tags:
 *       - meed
 *       - city
 *     operationId: createMeedRanking
 *     summary: Starts and retrieves MEED+ ranking for a given inventory
 *     description: Runs the ranking process in the MEED service, stores the result and returns ranked and removed actions.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Ranking retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     rankedActions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           inventoryId:
 *                             type: string
 *                             format: uuid
 *                           actionId:
 *                             type: string
 *                           rank:
 *                             type: number
 *                           finalScore:
 *                             type: number
 *                           impactScore:
 *                             type: number
 *                           alignmentScore:
 *                             type: number
 *                           feasibilityScore:
 *                             type: number
 *                           explanations:
 *                             type: object
 *                             properties:
 *                               en:
 *                                 type: string
 *                               es:
 *                                 type: string
 *                           created:
 *                             type: string
 *                             format: date-time
 *                           lastUpdated:
 *                             type: string
 *                             format: date-time
 *                     removedActions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           inventoryId:
 *                             type: string
 *                             format: uuid
 *                           actionId:
 *                             type: string
 *                           actionName:
 *                             type: string
 *                           removalReason:
 *                             type: string
 *                           removalSource:
 *                             type: string
 *                           verdictCategory:
 *                             type: string
 *                           ownershipCategory:
 *                             type: string
 *                           restrictionsCategory:
 *                             type: string
 *                           ownershipDescription:
 *                             type: object
 *                             properties:
 *                               en:
 *                                 type: string
 *                               es:
 *                                 type: string
 *                           restrictionsDescription:
 *                             type: object
 *                             properties:
 *                               en:
 *                                 type: string
 *                               es:
 *                                 type: string
 *                           legalJustification:
 *                             type: object
 *                             properties:
 *                               en:
 *                                 type: string
 *                               es:
 *                                 type: string
 *                           legalReferences:
 *                             type: array
 *                             items:
 *                               type: string
 *                           created:
 *                             type: string
 *                             format: date-time
 *                           lastUpdated:
 *                             type: string
 *                             format: date-time
 */

const runRankingRequest = z.object({
  // for CC internal use
  inventoryId: z.string().uuid(),

  // passed along to hiap-meed microservice
  requestedLanguages: z.array(z.string()),
  topN: z.number().int().optional(),
  createExplanations: z.boolean().default(false).optional(),
  cityDataList: z.array(
    z.object({
      excludedActionIds: z.array(z.string()).default([]),
      weightsOverride: z.record(z.number()),
      cityStrategicPreferenceSectors: z.array(z.string()),
      cityStrategicPreferenceTimeframes: z
        .array(z.enum(["short", "medium", "long", "no_preference"]))
        .default(["no_preference"]),
      cityStrategicPreferenceCoBenefitKeys: z.array(z.string()).default([]),
    }),
  ),
});

export type RunRankingRequest = Omit<
  z.infer<typeof runRankingRequest>,
  "inventoryId"
>;

export const POST = apiHandler(async (req, { session }) => {
  const body = runRankingRequest.parse(await req.json());
  const { inventoryId, ...requestBody } = body;
  await PermissionService.canAccessInventory(session, inventoryId);

  const result = await MeedApiService.runRanking(inventoryId, requestBody);
  return NextResponse.json({ data: result });
});

/**
 * @swagger
 * /api/v1/city/{city}/meed/rank:
 *   get:
 *     tags:
 *       - meed
 *       - city
 *     operationId: getMeedRanking
 *     summary: Fetches MEED+ ranking for a given inventory from the database
 *     description: Fetches ranking from the database and returns ranked and removed actions.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: inventoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Ranking retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     rankedActions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           inventoryId:
 *                             type: string
 *                             format: uuid
 *                           actionId:
 *                             type: string
 *                           rank:
 *                             type: number
 *                           finalScore:
 *                             type: number
 *                           impactScore:
 *                             type: number
 *                           alignmentScore:
 *                             type: number
 *                           feasibilityScore:
 *                             type: number
 *                           explanations:
 *                             type: object
 *                             properties:
 *                               en:
 *                                 type: string
 *                               es:
 *                                 type: string
 *                           weights:
 *                             type: object
 *                             properties:
 *                               impact:
 *                                 type: number
 *                               alignment:
 *                                 type: number
 *                               feasibility:
 *                                 type: number
 *                           created:
 *                             type: string
 *                             format: date-time
 *                           lastUpdated:
 *                             type: string
 *                             format: date-time
 *                     removedActions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           inventoryId:
 *                             type: string
 *                             format: uuid
 *                           actionId:
 *                             type: string
 *                           actionName:
 *                             type: string
 *                           removalReason:
 *                             type: string
 *                           removalSource:
 *                             type: string
 *                           verdictCategory:
 *                             type: string
 *                           ownershipCategory:
 *                             type: string
 *                           restrictionsCategory:
 *                             type: string
 *                           ownershipDescription:
 *                             type: object
 *                             properties:
 *                               en:
 *                                 type: string
 *                               es:
 *                                 type: string
 *                           restrictionsDescription:
 *                             type: object
 *                             properties:
 *                               en:
 *                                 type: string
 *                               es:
 *                                 type: string
 *                           legalJustification:
 *                             type: object
 *                             properties:
 *                               en:
 *                                 type: string
 *                               es:
 *                                 type: string
 *                           legalReferences:
 *                             type: array
 *                             items:
 *                               type: string
 *                           created:
 *                             type: string
 *                             format: date-time
 *                           lastUpdated:
 *                             type: string
 *                             format: date-time
 */

const getRankingQuery = z.object({
  inventoryId: z.string().uuid(),
});
export const GET = apiHandler(async (_req, { session, searchParams }) => {
  const { inventoryId } = getRankingQuery.parse(searchParams);
  await PermissionService.canAccessInventory(session, inventoryId);

  const result = await MeedApiService.getRanking(inventoryId);
  return NextResponse.json({ data: result });
});
