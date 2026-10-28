import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { PublicDashboardService } from "@/backend/PublicDashboardService";
import createHttpError from "http-errors";
import { validate } from "uuid";
import type { CityDashboardResponse } from "@/util/types";

/**
 * @swagger
 * /api/v1/public/city/{cityId}/dashboard:
 *   get:
 *     operationId: getPublicCityDashboard
 *     tags:
 *       - public
 *       - dashboard
 *     summary: Get consolidated public dashboard data for a city
 *     description: Returns all public dashboard data in a single response including city info, public inventories, population, and widget data. No authentication required, but only returns data for cities with public inventories.
 *     parameters:
 *       - in: path
 *         name: cityId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: City ID
 *       - in: query
 *         name: lng
 *         required: false
 *         schema:
 *           type: string
 *         description: Language code for localized content, defaults to en
 *     responses:
 *       200:
 *         description: Consolidated public dashboard data
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
 *                     inventories:
 *                       type: array
 *                       items:
 *                         type: object
 *                     population:
 *                       type: object
 *                       nullable: true
 *                     widgets:
 *                       type: object
 *                       properties:
 *                         ghgi:
 *                           type: object
 *                           nullable: true
 *                         hiap:
 *                           type: object
 *                           nullable: true
 *                         ccra:
 *                           type: object
 *                           nullable: true
 *       400:
 *         description: Invalid city ID
 *       404:
 *         description: City not found or no public data available
 */

export const GET = apiHandler(async (req, { params }) => {
  const { cityId } = params;
  const searchParams = new URL(req.url).searchParams;
  const lng = searchParams.get("lng") || "en";

  if (!validate(cityId)) {
    throw new createHttpError.BadRequest(
      `'${cityId}' is not a valid city id (uuid)`,
    );
  }

  const shell = await PublicDashboardService.getDashboardShell(cityId);

  if (shell.status === "not-found") {
    throw new createHttpError.NotFound(
      "No public data available for this city",
    );
  }

  const { ghgi, hiap, ccra } = PublicDashboardService.getStreamableWidgetData(
    cityId,
    shell.latestInventory,
    lng,
  );
  const [ghgiData, hiapData, ccraData] = await Promise.all([ghgi, hiap, ccra]);

  const response: CityDashboardResponse = {
    city: shell.city,
    inventories: shell.inventories,
    population: shell.population,
    organization: null, // Public dashboards don't include organization data
    widgets: {
      ghgi: ghgiData,
      hiap: hiapData,
      ccra: ccraData,
    },
  };

  return NextResponse.json({ data: response });
});
