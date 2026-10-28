import MeedApiService from "@/backend/MeedApiService";
import { PermissionService } from "@/backend/permissions";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import z from "zod";

/**
 * @swagger
 * /api/v1/city/{city}/meed/finance/feasibility:
 *   get:
 *     tags:
 *       - meed
 *       - city
 *     operationId: getMeedFinanceFeasibility
 *     summary: Fetches MEED+ finance feasibility data
 *     description: Fetches MEED+ finance feasibility data for the given city via the MEED service from the global API
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Finance feasibility data retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     locode:
 *                       type: string
 *                     country_code:
 *                       type: string
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           action_id:
 *                             type: string
 *                           action_name:
 *                             type: string
 *                           sector:
 *                             type: string
 *                           financial_feasibility:
 *                             type: number
 *                           route:
 *                             type: string
 *                           reason:
 *                             type: string
 *                           inputs:
 *                             type: object
 *                             properties:
 *                               action:
 *                                 type: object
 *                                 properties:
 *                                   capital_intensity:
 *                                     type: number
 *                                   preparation_complexity:
 *                                     type: number
 *                               city:
 *                                 type: object
 *                                 properties:
 *                                   profile:
 *                                     type: string
 *                               finance:
 *                                 type: object
 *                                 properties:
 *                                   fund_access:
 *                                     type: string
 *                                   n_reachable_opportunities:
 *                                     type: number
 *                               evidence:
 *                                 type: object
 *                                 properties:
 *                                   n_existing_projects:
 *                                     type: number
 */
const getFinanceFeasibilityParams = z.object({
  city: z.string().uuid(),
});
export const GET = apiHandler(async (_req, { session, params }) => {
  const { city: cityId } = getFinanceFeasibilityParams.parse(params);
  await PermissionService.canAccessCity(session, cityId);
  const result = await MeedApiService.getFinanceFeasibility(cityId);
  return NextResponse.json({ data: result });
});
