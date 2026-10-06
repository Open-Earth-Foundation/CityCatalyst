/**
 * @swagger
 * /api/v1/city/{city}/modules/meed/policy-scores:
 *   get:
 *     tags:
 *       - city
 *       - modules
 *     operationId: getMeedModulePolicyScores
 *     summary: Get policy-alignment scores per action for the MEED+ module.
 *     description: Proxies the Global API action-policy-scores endpoint for the city's locode. Requires a signed-in user with access to the city. Response is wrapped in '{' data '}'; data is null when the upstream has no data for this city.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Policy scores wrapped in data.
 */
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import createHttpError from "http-errors";
import UserService from "@/backend/UserService";
import { MeedGlobalApiService } from "@/backend/meed/MeedGlobalApiService";
import { z } from "zod";

const paramsSchema = z.object({
  city: z.string().uuid("City ID must be a valid UUID"),
});

export const GET = apiHandler(async (_req: Request, context) => {
  const { city: cityId } = paramsSchema.parse(context.params);
  const city = await UserService.findUserCity(cityId, context.session);
  if (!city.locode) {
    throw new createHttpError.BadRequest("City has no locode");
  }

  const data = await MeedGlobalApiService.fetchPolicyScores(city.locode);
  return NextResponse.json({ data });
});
