import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import ActionPlanService from "@/backend/hiap/ActionPlanService";
import { z } from "zod";
import createHttpError from "http-errors";

const updateActionPlanSchema = z.object({
  planData: z.any().optional(),
  actionName: z.string().optional(),
});

/**
 * @swagger
 * /api/v0/city/{city}/hiap/action-plan/{id}:
 *   get:
 *     summary: Get action plan by ID
 *     description: Retrieve a specific action plan by its ID
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Action plan ID
 *     responses:
 *       200:
 *         description: Action plan details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *       404:
 *         description: Action plan not found
 */
export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const { id } = params;

  if (!id || typeof id !== "string") {
    throw createHttpError.BadRequest("Invalid action plan ID");
  }

  const actionPlan = await ActionPlanService.getActionPlanById(id);

  if (!actionPlan) {
    throw createHttpError.NotFound(`Action plan with id ${id} not found`);
  }

  return NextResponse.json({ data: actionPlan });
});

/**
 * @swagger
 * /api/v0/city/{city}/hiap/action-plan/{id}:
 *   patch:
 *     summary: Update action plan
 *     description: Update an existing action plan with new data
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Action plan ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planData:
 *                 type: object
 *               actionName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Action plan updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *       404:
 *         description: Action plan not found
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  const { id } = params;

  if (!id || typeof id !== "string") {
    throw createHttpError.BadRequest("Invalid action plan ID");
  }

  const body = await req.json();
  const validatedData = updateActionPlanSchema.parse(body);

  const actionPlan = await ActionPlanService.updateActionPlan({
    id,
    ...validatedData,
  });

  return NextResponse.json({ data: actionPlan });
});

/**
 * @swagger
 * /api/v0/city/{city}/hiap/action-plan/{id}:
 *   delete:
 *     summary: Delete action plan
 *     description: Delete an action plan by its ID
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Action plan ID
 *     responses:
 *       200:
 *         description: Action plan deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       404:
 *         description: Action plan not found
 */
export const DELETE = apiHandler(async (req: NextRequest, { params }) => {
  const { id } = params;

  if (!id || typeof id !== "string") {
    throw createHttpError.BadRequest("Invalid action plan ID");
  }

  await ActionPlanService.deleteActionPlan(id);

  return NextResponse.json({ success: true });
});
