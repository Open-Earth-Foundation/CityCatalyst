import MeedApiService from "@/backend/MeedApiService";
import { PermissionService } from "@/backend/permissions";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import z from "zod";

/**
 * @swagger
 * /api/v1/city/{city}/meed/city-attributes:
 *   get:
 *     tags:
 *       - meed
 *       - city
 *     operationId: getMeedCityAttributes
 *     summary: Fetches MEED+ city attributes
 *     description: Fetches MEED+ city attributes for the given city via the MEED service from the global API
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: City attributes retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     city:
 *                       type: object
 *                       properties:
 *                         locode:
 *                           type: string
 *                         city_name:
 *                           type: string
 *                         country_code:
 *                           type: string
 *                         region_name:
 *                           type: string
 *                         population_size:
 *                           type: number
 *                         area_km2:
 *                           type: number
 *                         population_density:
 *                           type: number
 *                         indicators:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               key:
 *                                 type: string
 *                               value:
 *                                 type: number
 *                               unit:
 *                                 type: string
 *                               category:
 *                                 type: string
 */
const getCityAttributesParams = z.object({
  city: z.string().uuid(),
});
export const GET = apiHandler(async (_req, { session, params }) => {
  const { city: cityId } = getCityAttributesParams.parse(params);
  await PermissionService.canAccessCity(session, cityId);
  const result = await MeedApiService.getCityAttributes(cityId);
  return NextResponse.json({ data: result });
});
