/**
 * @swagger
 * /api/v0/city/{city}/population/{year}:
 *   get:
 *     tags:
 *       - City Population
 *     summary: Get population data for a specific city and year
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: City ID for which to retrieve population data
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: Year for which to retrieve population data
 *     responses:
 *       200:
 *         description: Population data returned.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   description: Population data for the specified city and year
 */
import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import PopulationService from "@/backend/PopulationService";

export const GET = apiHandler(async (_req: Request, { session, params }) => {
  const city = await UserService.findUserCity(params.city, session, true);
  const year = z.coerce.number().parse(params.year);

  const cityPopulationData =
    await PopulationService.getPopulationDataForCityYear(city.cityId, year);

  return NextResponse.json({
    data: cityPopulationData,
  });
});
