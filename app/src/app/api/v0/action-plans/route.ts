import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import ActionPlanService from "@/backend/ActionPlanService";
import { z } from "zod";
import createHttpError from "http-errors";

const getActionPlansSchema = z.object({
  inventoryId: z.string().uuid().optional(),
  language: z.string().optional(),
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
 * /api/v0/action-plans:
 *   get:
 *     summary: Get action plans
 *     description: Retrieve action plans with optional filtering by inventory ID and language
 *     parameters:
 *       - in: query
 *         name: inventoryId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by inventory ID
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter by language
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
    const { inventoryId, language } = getActionPlansSchema.parse(queryParams);

    if (!inventoryId) {
      throw createHttpError.BadRequest("inventoryId is required");
    }

    const actionPlans = await ActionPlanService.getActionPlansByInventoryId(
      inventoryId,
      language,
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
 * /api/v0/action-plans:
 *   post:
 *     summary: Create a new action plan
 *     description: Create a new action plan with the provided data
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
  try {
    const body = await req.json();
    const validatedData = createActionPlanSchema.parse(body);

    const actionPlan = await ActionPlanService.createActionPlan({
      ...validatedData,
      createdBy: session?.user?.id,
    });

    return NextResponse.json({ data: actionPlan }, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw createHttpError.BadRequest(
        `Invalid request body: ${error.message}`,
      );
    }
    throw error;
  }
});
