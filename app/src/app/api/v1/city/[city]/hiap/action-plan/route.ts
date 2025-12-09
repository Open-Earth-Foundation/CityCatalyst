import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import ActionPlanService from "@/backend/hiap/ActionPlanService";
import { z } from "zod";
import createHttpError from "http-errors";

const getActionPlansSchema = z.object({
  cityId: z.string().optional(), // Optional since we get it from path params
  language: z.string(),
  actionId: z.string(),
});

const createActionPlanSchema = z.object({
  actionId: z.string(),
  inventoryId: z.string().uuid(),
  hiActionRankingId: z.string().uuid(),
  cityLocode: z.string(),
  actionName: z.string(),
  language: z.string(),
  planData: z.any(),
});

/**
 * @swagger
 * /api/v1/city/{city}/hiap/action-plan:
 *   get:
 *     operationId: getCityCityHiapActionPlan
 *     summary: Get or translate action plans for a city
 *     description: Retrieve action plans for a specific city, language, and action. Automatically translates if the plan doesn't exist in the requested language.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID
 *       - in: query
 *         name: cityId
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID (same as path param)
 *       - in: query
 *         name: language
 *         required: true
 *         schema:
 *           type: string
 *         description: Target language for the action plan
 *       - in: query
 *         name: actionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Specific action ID to retrieve
 *     responses:
 *       200:
 *         description: Action plan (existing or newly translated)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 */
export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const url = new URL(req.url);
  const queryParams = Object.fromEntries(url.searchParams.entries());

  try {
    const { language, actionId } = getActionPlansSchema.parse(queryParams);
    const cityId = params.city as string;

    const actionPlans = await ActionPlanService.fetchOrTranslateActionPlan(
      cityId,
      language,
      actionId,
    );

    return NextResponse.json({ data: actionPlans });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw createHttpError.BadRequest(
        `Invalid query parameters: ${error.message}`,
      );
    }
    throw error;
  }
});

/**
 * @swagger
 * /api/v1/city/{city}/hiap/action-plan:
 *   post:
 *     operationId: postCityCityHiapActionplan
 *     summary: Create or update an action plan for a city
 *     description: Upsert an action plan with the provided data. The cityId is extracted from the route parameter.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - actionId
 *               - inventoryId
 *               - hiActionRankingId
 *               - cityLocode
 *               - actionName
 *               - language
 *               - planData
 *             properties:
 *               actionId:
 *                 type: string
 *                 description: ID of the high impact action
 *               inventoryId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the inventory
 *               hiActionRankingId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the high impact action ranking (required)
 *               cityLocode:
 *                 type: string
 *                 description: City location code
 *               actionName:
 *                 type: string
 *                 description: Name of the action
 *               language:
 *                 type: string
 *                 description: Language code
 *               planData:
 *                 type: object
 *                 description: Action plan data object
 *     responses:
 *       201:
 *         description: Action plan created or updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 */
export const POST = apiHandler(
  async (req: NextRequest, { session, params }) => {
    const body = await req.json();

    const validatedData = createActionPlanSchema.parse(body);

    const { actionPlan } = await ActionPlanService.upsertActionPlan({
      cityId: params.city,
      actionId: validatedData.actionId,
      highImpactActionRankedId: validatedData.hiActionRankingId,
      cityLocode: validatedData.cityLocode,
      actionName: validatedData.actionName,
      language: validatedData.language,
      planData: validatedData.planData,
      createdBy: session?.user?.id,
    });

    return NextResponse.json({ data: actionPlan }, { status: 201 });
  },
);
