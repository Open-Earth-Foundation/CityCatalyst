import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import ActionPlanService from "@/backend/hiap/ActionPlanService";
import { z } from "zod";
import createHttpError from "http-errors";

const getActionPlansSchema = z.object({
  cityId: z.string().optional(),
  language: z.string().optional(),
  actionId: z.string().optional(),
});

const createActionPlanSchema = z.object({
  actionId: z.string(),
  inventoryId: z.string().uuid(),
  hiActionRankingId: z.string().uuid().optional(),
  cityLocode: z.string(),
  actionName: z.string(),
  language: z.string(),
  planData: z.any(),
});

/**
 * @swagger
 * /api/v0/city/{city}/hiap/action-plans:
 *   get:
 *     summary: Get action plans for a city
 *     description: Retrieve action plans with optional filtering by language and action ID
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter by language
 *       - in: query
 *         name: actionId
 *         schema:
 *           type: string
 *         description: Filter by specific action ID
 *     responses:
 *       200:
 *         description: List of action plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const queryParams = Object.fromEntries(url.searchParams.entries());

  try {
    const { cityId, language, actionId } =
      getActionPlansSchema.parse(queryParams);

    const actionPlans = await ActionPlanService.getActionPlansByCityId(
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
 * /api/v0/city/{city}/hiap/action-plans:
 *   post:
 *     summary: Create a new action plan for a city
 *     description: Create a new action plan with the provided data
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
 *               - cityLocode
 *               - actionName
 *               - language
 *               - planData
 *             properties:
 *               actionId:
 *                 type: string
 *               inventoryId:
 *                 type: string
 *                 format: uuid
 *               hiActionRankingId:
 *                 type: string
 *                 format: uuid
 *               cityLocode:
 *                 type: string
 *               actionName:
 *                 type: string
 *               language:
 *                 type: string
 *               planData:
 *                 type: object
 *     responses:
 *       201:
 *         description: Action plan created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 */
export const POST = apiHandler(async (req: NextRequest, { session }) => {
  const body = await req.json();
  const validatedData = createActionPlanSchema.parse(body);

  const { actionPlan } = await ActionPlanService.upsertActionPlan({
    actionId: validatedData.actionId,
    highImpactActionRankedId: validatedData.hiActionRankingId,
    cityLocode: validatedData.cityLocode,
    actionName: validatedData.actionName,
    language: validatedData.language,
    planData: validatedData.planData,
    createdBy: session?.user?.id,
  });

  return NextResponse.json({ data: actionPlan }, { status: 201 });
});
