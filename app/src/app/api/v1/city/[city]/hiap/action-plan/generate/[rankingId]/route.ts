import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import { z } from "zod";
import createHttpError from "http-errors";
import { languages } from "@/i18n/settings";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { hiapApiWrapper } from "@/backend/hiap/HiapApiService";
import { ACTION_TYPES, HIAction, LANGUAGES } from "@/util/types";

const generateRankingRequest = z.object({
  action: z.any(), // HIAction object - using z.any() for flexibility
  inventoryId: z.string().uuid("Inventory ID is required"),
  cityLocode: z.string().min(1, "City is required"),
  lng: z.enum([languages[0], ...languages.slice(1)]).optional(), // workaround for required first element in Zod type
});

/**
 * @swagger
 * /api/v1/city/{city}/hiap/action-plan/generate/{rankingId}:
 *   post:
 *     tags:
 *       - city
 *       - hiap
 *     operationId: postCityHiapActionPlanGenerateRankingId
 *     summary: Generate action plan for a specific ranking
 *     description: Generate a new action plan based on the provided action and ranking ID. The city ID is extracted from the route parameter.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID
 *       - in: path
 *         name: rankingId
 *         required: true
 *         schema:
 *           type: string
 *         description: Ranking ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *               - inventoryId
 *               - cityLocode
 *             properties:
 *               action:
 *                 type: object
 *                 description: HIAction object
 *               inventoryId:
 *                 type: string
 *                 format: uuid
 *               cityLocode:
 *                 type: string
 *               lng:
 *                 type: string
 *                 description: Language code
 *     responses:
 *       200:
 *         description: Action plan generation started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 */
export const POST = apiHandler(
  async (req: NextRequest, { params, session }) => {
    const body = generateRankingRequest.parse(await req.json());
    await PermissionService.canAccessInventory(session, body.inventoryId);

    const lng = body.lng || languages[0];

    const result = await hiapApiWrapper.startActionPlanJob({
      action: body.action as HIAction,
      cityId: params.city,
      cityLocode: body.cityLocode,
      lng: lng as LANGUAGES,
      inventoryId: body.inventoryId,
      createdBy: session?.user?.id,
    });

    return NextResponse.json({ data: result });
  },
);
