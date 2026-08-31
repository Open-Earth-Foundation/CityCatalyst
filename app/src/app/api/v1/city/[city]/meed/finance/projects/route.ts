import MeedApiService from "@/backend/MeedApiService";
import { PermissionService } from "@/backend/permissions";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import z from "zod";

/**
 * @swagger
 * /api/v1/city/{city}/meed/finance/projects:
 *   get:
 *     tags:
 *       - meed
 *       - city
 *     operationId: getMeedFinanceProjects
 *     summary: Fetches MEED+ finance projects data
 *     description: Fetches MEED+ finance projects data for the given city via the MEED service from the global API
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Finance projects data retrieved
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
 *                     projects:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           project_name:
 *                             type: string
 *                           project_name_i18n:
 *                             type: object
 *                             properties:
 *                               en:
 *                                 type: string
 *                               es:
 *                                 type: string
 *                               pt:
 *                                 type: string
 *                           sector:
 *                             type: string
 *                           jurisdiction:
 *                             type: number
 *                           lifecycle_stage:
 *                             type: string
 *                           funding_channel:
 *                             type: string
 *                           cost_total:
 *                             type: number
 *                           amount_unit:
 *                             type: string
 *                           funding_sources:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 cycle:
 *                                   type: string
 *                                 amount:
 *                                   type: number
 *                                 amount_unit:
 *                                   type: string
 *                                 funder_name:
 *                                   type: string
 *                           action_matches:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 action_id:
 *                                   type: string
 *                                 confidence:
 *                                   type: string
 */
const getFinanceProjectsParams = z.object({
  city: z.string().uuid(),
});
const getFinanceProjectsQueryParams = z.object({
  actionId: z.string().min(1),
});
export const GET = apiHandler(
  async (_req, { session, params, searchParams }) => {
    const { city: cityId } = getFinanceProjectsParams.parse(params);
    const { actionId } = getFinanceProjectsQueryParams.parse(searchParams);
    await PermissionService.canAccessCity(session, cityId);

    const result = await MeedApiService.getFinanceProjects(cityId, actionId);
    return NextResponse.json({ data: result });
  },
);
