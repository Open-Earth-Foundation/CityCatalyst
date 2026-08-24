import MeedApiService from "@/backend/MeedApiService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

/**
 * @swagger
 * /api/v1/city/{city}/meed/actions:
 *   get:
 *     tags:
 *       - meed
 *       - city
 *     operationId: getMeedActions
 *     summary: Fetches MEED+ action pathways
 *     description: Fetches MEED+ action pathways via the MEED service from the global API
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Actions retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     actions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           action_id:
 *                             type: string
 *                           inventoryId:
 *                             type: string
 *                             format: uuid
 *                           action_name:
 *                             type: string
 *                           action_type:
 *                             type: string
 *                           description:
 *                             type: string
 *                           name_i18n:
 *                             type: object
 *                             properties:
 *                               en:
 *                                 type: string
 *                               es:
 *                                 type: string
 *                               pt:
 *                                 type: string
 *                           description_i18n:
 *                             type: object
 *                             properties:
 *                               en:
 *                                 type: string
 *                               es:
 *                                 type: string
 *                               pt:
 *                                 type: string
 *
 *                           investment_cost:
 *                             type: string
 *                           implementation_timeline:
 *                             type: string
 *                           co_benefits:
 *                             type: object
 *                             additionalProperties:
 *                               type: object
 *                               properties:
 *                                 impact_relationship:
 *                                   type: string
 *                                 impact_text:
 *                                   type: string
 *                                 impact_numeric:
 *                                   type: number
 *                                 methodology:
 *                                   type: string
 *                          emissions:
 *                            type: object
 *                            properties:
 *                              sector_number:
 *                                type: string
 *                              subsector_number:
 *                                type: number
 *                              gpc_reference_number:
 *                                type: array
 *                                items:
 *                                  type: string
 *                              impact_relationship:
 *                                type: string
 *                              impact_text:
 *                                type: string
 *                              impact_numeric:
 *                                type: number
 *                              methodology:
 *                                type: string
 */
export const GET = apiHandler(async (_req) => {
  const result = await MeedApiService.getActions();
  return NextResponse.json({ data: result });
});
