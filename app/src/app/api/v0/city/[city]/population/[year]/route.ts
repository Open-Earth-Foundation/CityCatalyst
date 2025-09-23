/**
 * @swagger
 * /api/v0/city/{city}/population/{year}:
 *   get:
 *     tags:
 *       - City Population
 *     summary: Get population data for city and year
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Population data returned.
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
