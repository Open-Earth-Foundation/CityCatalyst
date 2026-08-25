/**
 * @swagger
 * /api/v1/city/{city}/modules/meed/actions:
 *   get:
 *     tags:
 *       - city
 *       - modules
 *     operationId: getMeedModuleActions
 *     summary: Get the live mitigation action catalog for the MEED+ module.
 *     description: Proxies the Global API action-pathways catalog. Requires a signed-in user with access to the city. Response is wrapped in '{' data '}'; data is null when the upstream has no data.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Action catalog wrapped in data.
 */
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import UserService from "@/backend/UserService";
import { MeedGlobalApiService } from "@/backend/meed/MeedGlobalApiService";
import { z } from "zod";

const paramsSchema = z.object({
  city: z.string().uuid("City ID must be a valid UUID"),
});

export const GET = apiHandler(async (_req: Request, context) => {
  const { city: cityId } = paramsSchema.parse(context.params);
  await UserService.findUserCity(cityId, context.session);

  const data = await MeedGlobalApiService.fetchActionPathways();
  return NextResponse.json({ data });
});
