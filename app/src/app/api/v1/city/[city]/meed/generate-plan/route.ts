import MeedApiService from "@/backend/MeedApiService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import z from "zod";

/**
 * @swagger
 * /api/v1/city/{city}/meed/generate-plan:
 *   post:
 *     tags:
 *       - meed
 *       - city
 *     operationId: generateMeedPlan
 *     summary: Generates an report plan output
 *     description: Uses the MEED service to create a plan output in structured markdown format
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
 *               languages:
 *                 type: array
 *                 items:
 *                   type: string
 *               actionId:
 *                 type: string
 *               debugContextOnly:
 *                 type: boolean
 *                 required: false
 *     responses:
 *       200:
 *         description: Output plan generated
 */

const generatePlanRequest = z.object({
  inventoryId: z.string().uuid(),
  languages: z.array(z.string().min(2)),
  actionId: z.string().min(1),
  debugContextOnly: z.boolean().default(false),
});

export const POST = apiHandler(async (req, { session }) => {
  const body = generatePlanRequest.parse(await req.json());
  await PermissionService.canAccessInventory(session, body.inventoryId);

  const result = await MeedApiService.generatePlan(
    body.inventoryId,
    body.languages,
    body.actionId,
    body.debugContextOnly,
  );
  return NextResponse.json({ data: result });
});
