import MeedApiService from "@/backend/MeedApiService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import z from "zod";

/**
 * @swagger
 * /api/v1/city/{city}/meed/state:
 *   get:
 *     tags:
 *       - meed
 *       - city
 *     operationId: getMeedState
 *     summary: Fetches MEED+ module state for a given inventory
 *     description: Fetches MEED+ module state (user settings) for the inventory passed in the search parameter 'inventoryId'
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: State retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     inventoryId:
 *                       type: string
 *                       format: uuid
 *                     exclusions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     sectors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     strategicPriorities:
 *                       type: array
 *                       items:
 *                         type: string
 *                     timeline:
 *                       type: array
 *                       items:
 *                         type: string
 *                     impactWeight:
 *                       type: number
 *                     alignmentWeight:
 *                       type: number
 *                     feasibilityWeight:
 *                       type: number
 *                     excludedSectors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     excludedCoBenefits:
 *                       type: array
 *                       items:
 *                         type: string
 *                     excludeText:
 *                       type: string
 *                     created:
 *                       type: string
 *                       format: date-time
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 */
export const GET = apiHandler(async (_req, { session, searchParams }) => {
  const { inventoryId } = searchParams;
  await PermissionService.canAccessInventory(session, inventoryId);

  const result = await MeedApiService.getState(inventoryId);
  return NextResponse.json({ data: result });
});

/**
 * @swagger
 * /api/v1/city/{city}/meed/state:
 *   post:
 *     tags:
 *       - meed
 *       - city
 *     operationId: setMeedState
 *     summary: Updates the MEED+ module state for a given inventory
 *     description: Changes supplied state properties for the inventory passed in the request body field 'inventoryId'
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventoryId:
 *                 type: string
 *                 format: uuid
 *               exclusions:
 *                 type: array
 *                 items:
 *                   type: string
 *               sectors:
 *                 type: array
 *                 items:
 *                   type: string
 *               strategicPriorities:
 *                 type: array
 *                 items:
 *                   type: string
 *               timeline:
 *                 type: array
 *                 items:
 *                   type: string
 *               impactWeight:
 *                 type: number
 *               alignmentWeight:
 *                 type: number
 *               feasibilityWeight:
 *                 type: number
 *               excludedSectors:
 *                 type: array
 *                 items:
 *                   type: string
 *               excludedCoBenefits:
 *                 type: array
 *                 items:
 *                   type: string
 *               excludeText:
 *                 type: string
 *     responses:
 *       200:
 *         description: State updated, returned in response
 */

const setMeedStateRequest = z.object({
  inventoryId: z.string().uuid(),
  exclusions: z.array(z.string().min(1)).optional(),
  sectors: z.array(z.string().min(1)).optional(),
  strategicPriorities: z.array(z.string().min(1)).optional(),
  timeline: z.array(z.string().min(1)).optional(),

  impactWeight: z.number().gte(0).lte(1).optional(),
  alignmentWeight: z.number().gte(0).lte(1).optional(),
  feasibilityWeight: z.number().gte(0).lte(1).optional(),

  excludedSectors: z.array(z.string().min(1)).optional(),
  excludedCoBenefits: z.array(z.string().min(1)).optional(),
  excludeText: z.string().min(1).optional(),
});

export const POST = apiHandler(async (req, { session }) => {
  const body = setMeedStateRequest.parse(await req.json());
  await PermissionService.canAccessInventory(session, body.inventoryId);

  const result = await MeedApiService.setState(body);
  return NextResponse.json({ data: result });
});
