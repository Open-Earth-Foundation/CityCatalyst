import MeedApiService from "@/backend/MeedApiService";
import { PermissionService } from "@/backend/permissions";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import z from "zod";

/**
 * @swagger
 * /api/v1/city/{city}/meed/finance/opportunities:
 *   get:
 *     tags:
 *       - meed
 *       - city
 *     operationId: getMeedFinanceOpportunities
 *     summary: Fetches MEED+ finance opportunities data
 *     description: Fetches MEED+ finance opportunities data for the given city via the MEED service from the global API
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Finance opportunities data retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     current:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           opportunity_name:
 *                             type: string
 *                           funder_name:
 *                             type: string
 *                           instrument:
 *                             type: string
 *                           status:
 *                             type: string
 *                           source_url:
 *                             type: string
 *                     monitor:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           opportunity_name:
 *                             type: string
 *                           funder_name:
 *                             type: string
 *                           instrument:
 *                             type: string
 *                           status:
 *                             type: string
 *                           source_url:
 *                             type: string
 *                           recurrence:
 *                             type: string
 */
const getFinanceOpportunitiesParams = z.object({
  city: z.string().uuid(),
});
const getFinanceOpportunitiesQueryParams = z.object({
  sector: z.string().min(1),
  financeRoute: z.string().min(1),
});
export const GET = apiHandler(
  async (_req, { session, params, searchParams }) => {
    const { city: cityId } = getFinanceOpportunitiesParams.parse(params);
    const { sector, financeRoute } =
      getFinanceOpportunitiesQueryParams.parse(searchParams);
    await PermissionService.canAccessCity(session, cityId);

    const result = await MeedApiService.getFinanceOpportunities(
      cityId,
      sector,
      financeRoute,
    );
    return NextResponse.json({ data: result });
  },
);
