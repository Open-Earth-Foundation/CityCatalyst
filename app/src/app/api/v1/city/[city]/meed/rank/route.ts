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
 *     summary: Starts and retrieves MEED+ ranking for a given city
 *     description:
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
 *             // TODO adjust to returned data schema
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     cityId:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     region:
 *                       type: string
 *                       nullable: true
 *                     country:
 *                       type: string
 *                       nullable: true
 *                     locode:
 *                       type: string
 *                       nullable: true
 *                     population:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           year:
 *                             type: number
 *                           population:
 *                             type: number
 *                     boundaries:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           boundaryId:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 */

const runRankingRequest = z.object({
  // for CC internal use
  inventoryId: z.string(),

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
