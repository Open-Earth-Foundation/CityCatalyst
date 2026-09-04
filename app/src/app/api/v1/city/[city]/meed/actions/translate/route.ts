import MeedApiService from "@/backend/MeedApiService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import z from "zod";

/**
 * @swagger
 * /api/v1/city/{city}/meed/actions/translate:
 *   post:
 *     tags:
 *       - meed
 *       - city
 *     operationId: translateMeedActions
 *     summary: Translates explanations for given list of actions to other languages
 *     description: Translates explanations into other languages, saves them to the database and returns translated actions
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
 *               sourceLanguage:
 *                 type: string
 *               targetLanguages:
 *                 type: array
 *                 items:
 *                   type: string
 *               actionIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Actions translated, returned in result body
 */

const translateActionsRequest = z.object({
  inventoryId: z.string().uuid(),
  sourceLanguage: z.string().min(2),
  targetLanguages: z.array(z.string().min(2)).min(1),
  actionIds: z.array(z.string().min(1)).min(1),
});

export const POST = apiHandler(async (req, { session }) => {
  const body = translateActionsRequest.parse(await req.json());
  await PermissionService.canAccessInventory(session, body.inventoryId);

  const result = await MeedApiService.translateExplanations(
    body.inventoryId,
    body.sourceLanguage,
    body.targetLanguages,
    body.actionIds,
  );
  return NextResponse.json({ data: result });
});
