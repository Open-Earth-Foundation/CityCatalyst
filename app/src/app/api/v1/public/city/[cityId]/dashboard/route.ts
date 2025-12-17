import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { ModuleDashboardService } from "@/backend/ModuleDashboardService";
import PopulationService from "@/backend/PopulationService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { db } from "@/models";
import createHttpError from "http-errors";
import { validate } from "uuid";
import type {
  CityDashboardResponse,
  GHGInventorySummary,
  HIAPSummary,
  CCRASummary,
} from "@/util/types";
import { Inventory } from "@/models/Inventory";
import { logger } from "@/services/logger";

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

  // Check if city has any public inventories
  const publicInventoriesCount = await db.models.Inventory.count({
    where: {
      cityId: cityId,
      isPublic: true,
    },
  });

  if (publicInventoriesCount === 0) {
    throw new createHttpError.NotFound(
      "No public data available for this city",
    );
  }

  // Fetch city data
  const city = await db.models.City.findByPk(cityId, {
    include: [
      {
        model: db.models.Project,
        as: "project",
        attributes: ["projectId", "name", "organizationId"],
        include: [
          {
            model: db.models.Organization,
            as: "organization",
            attributes: ["organizationId", "name", "logoUrl", "active"],
            include: [
              {
                model: db.models.Theme,
                as: "theme",
                attributes: ["themeKey"],
              },
            ],
          },
        ],
      },
    ],
  });

  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  // Fetch public inventories and population in parallel
  const [publicInventories, populationData] = await Promise.all([
    // Get only public inventories
    db.models.Inventory.findAll({
      where: {
        cityId,
        isPublic: true,
      },
      order: [["year", "DESC"]],
    }),
    // Get most recent population
    PopulationService.getMostRecentPopulationDataForCity(cityId),
  ]);

  const latestInventory = publicInventories[0] as Inventory | undefined;
  const inventoryId = latestInventory?.inventoryId;

  // Verify access to the inventory (handles public access automatically)
  let ghgiData = null;
  let hiapData = null;
  let ccraData = null;

  if (inventoryId) {
    try {
      // Check if user can access this inventory (handles public inventories)
      const { resource } = await PermissionService.canAccessInventory(
        null, // No session for public access
        inventoryId,
        { includeResource: true },
      );

      const inventory = resource as Inventory;

      if (inventory && inventory.cityId === cityId) {
        // Fetch widget data in parallel
        [ghgiData, hiapData, ccraData] = await Promise.all([
          // GHGI dashboard data
          ModuleDashboardService.getGHGIDashboardData(cityId, inventory).catch(
            (err) => {
              logger.error({ error: err }, "Error fetching GHGI dashboard");
              return null;
            },
          ),
          // HIAP dashboard data
          ModuleDashboardService.getHIAPDashboardData(
            cityId,
            inventory,
            lng,
            undefined, // No session for public
            false,
          ).catch((err) => {
            logger.error({ error: err }, "Error fetching HIAP dashboard");
            return null;
          }),
          // CCRA dashboard data
          ModuleDashboardService.getCCRADashboardData(cityId, inventory).catch(
            (err) => {
              logger.error({ error: err }, "Error fetching CCRA dashboard");
              return null;
            },
          ),
        ]);
      }
    } catch (err) {
      // If access check fails, widgets will be null
      logger.error({ error: err }, "Error checking inventory access");
    }
  }

  const response: CityDashboardResponse = {
    city: city as CityDashboardResponse["city"],
    inventories: publicInventories.map((inv) => inv.toJSON()),
    population:
      populationData &&
      populationData.year !== null &&
      populationData.year !== undefined &&
      populationData.population !== null &&
      populationData.population !== undefined
        ? {
            cityId: populationData.cityId,
            year: populationData.year as number,
            population: populationData.population as number,
          }
        : null,
    organization: null, // Public dashboards don't include organization data
    widgets: {
      ghgi: ghgiData as GHGInventorySummary | null,
      hiap: hiapData as HIAPSummary | null,
      ccra: ccraData as CCRASummary | null,
    },
  };

  return NextResponse.json({ data: response });
});
