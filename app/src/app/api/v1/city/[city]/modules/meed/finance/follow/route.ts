/**
 * @swagger
 * /api/v1/city/{city}/modules/meed/finance/follow:
 *   get:
 *     tags:
 *       - city
 *       - modules
 *     operationId: getMeedFinanceFollowLink
 *     summary: Follow a relative finance link returned by the Global API.
 *     description: Finance feasibility rows contain relative links (links.projects, links.opportunities). This proxies such a link against the Global API host. Only /api/v1/cities/ paths are allowed. Requires a signed-in user with access to the city. Response is wrapped in '{' data '}'.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: link
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Linked resource wrapped in data.
 */
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import UserService from "@/backend/UserService";
import { MeedGlobalApiService } from "@/backend/meed/MeedGlobalApiService";
import { z } from "zod";

const paramsSchema = z.object({
  city: z.string().uuid("City ID must be a valid UUID"),
});

const querySchema = z.object({
  link: z
    .string()
    .startsWith("/api/v1/cities/", "Only Global API city paths are allowed"),
});

export const GET = apiHandler(async (req: Request, context) => {
  const { city: cityId } = paramsSchema.parse(context.params);
  await UserService.findUserCity(cityId, context.session);

  const { searchParams } = new URL(req.url);
  const { link } = querySchema.parse({ link: searchParams.get("link") });

  const data = await MeedGlobalApiService.followLink(link);
  return NextResponse.json({ data });
});
