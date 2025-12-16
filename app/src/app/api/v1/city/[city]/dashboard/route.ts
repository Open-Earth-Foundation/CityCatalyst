import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import UserService from "@/backend/UserService";
import { ModuleDashboardService } from "@/backend/ModuleDashboardService";
import PopulationService from "@/backend/PopulationService";
import { db } from "@/models";
import createHttpError from "http-errors";
import type {
  CityDashboardResponse,
  GHGInventorySummary,
  HIAPSummary,
  CCRASummary,
  OrganizationWithThemeResponse,
} from "@/util/types";
import { Inventory } from "@/models/Inventory";
import type { AppSession } from "@/lib/auth";
import { logger } from "@/services/logger";

/**
 * @swagger
 * /api/v1/city/{city}/dashboard:
 *   get:
 *     tags:
 *       - City Dashboard
 *     summary: Get consolidated dashboard data for a city
 *     description: Returns all dashboard data in a single response including city info, inventories, population, organization, and widget data (GHGI, HIAP, CCRA). Requires authentication and user access to the city.
 *     parameters:
 *       - in: path
 *         name: city
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
 *         description: Consolidated dashboard data
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
 *                     organization:
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
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - user does not have access to this city
 *       404:
 *         description: City not found
 */

export const GET = apiHandler(async (req, { params, session }) => {
  const cityId = params.city;
  const searchParams = new URL(req.url).searchParams;
  const lng = searchParams.get("lng") || "en";

  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  // Verify user has access to this city
  const city = await UserService.findUserCity(cityId, session, true);
  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  // Fetch all data in parallel
  const [inventories, populationData] = await Promise.all([
    // Get all inventories for the city
    db.models.Inventory.findAll({
      where: { cityId },
      order: [["year", "DESC"]],
    }),
    // Get most recent population
    PopulationService.getMostRecentPopulationDataForCity(cityId),
  ]);

  const latestInventory = inventories[0] as Inventory | undefined;
  const inventoryId = latestInventory?.inventoryId;

  // Fetch widget data and organization in parallel (only if inventory exists)
  const widgetPromises = inventoryId
    ? [
        // GHGI dashboard data
        ModuleDashboardService.getGHGIDashboardData(
          cityId,
          latestInventory,
        ).catch((err) => {
          // Log error but don't fail the entire request
          logger.error({ error: err }, "Error fetching GHGI dashboard");
          return null;
        }),
        // HIAP dashboard data
        ModuleDashboardService.getHIAPDashboardData(
          cityId,
          latestInventory,
          lng,
          session,
          false,
        ).catch((err) => {
          logger.error({ error: err }, "Error fetching HIAP dashboard");
          return null;
        }),
        // CCRA dashboard data
        ModuleDashboardService.getCCRADashboardData(
          cityId,
          latestInventory,
        ).catch((err) => {
          logger.error({ error: err }, "Error fetching CCRA dashboard");
          return null;
        }),
        // Organization data
        getOrganizationForInventory(inventoryId, session).catch((err) => {
          logger.error({ error: err }, "Error fetching organization");
          return null;
        }),
      ]
    : [
        Promise.resolve(null),
        Promise.resolve(null),
        Promise.resolve(null),
        Promise.resolve(null),
      ];

  const [ghgiData, hiapData, ccraData, organization] =
    await Promise.all(widgetPromises);

  // Fetch city with project/organization data
  const cityWithRelations = await db.models.City.findByPk(cityId, {
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

  const response: CityDashboardResponse = {
    city: cityWithRelations as CityDashboardResponse["city"],
    inventories: inventories.map((inv) => inv.toJSON()),
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
    organization: organization as OrganizationWithThemeResponse | null,
    widgets: {
      ghgi: ghgiData as GHGInventorySummary | null,
      hiap: hiapData as HIAPSummary | null,
      ccra: ccraData as CCRASummary | null,
    },
  };

  return NextResponse.json({ data: response });
});

/**
 * Helper function to get organization data for an inventory
 */
async function getOrganizationForInventory(
  inventoryId: string,
  session: AppSession | null,
): Promise<OrganizationWithThemeResponse | null> {
  const inventory = await UserService.findUserInventory(
    inventoryId,
    session,
    [
      {
        model: db.models.City,
        as: "city",
        include: [
          {
            model: db.models.Project,
            as: "project",
            include: [
              {
                model: db.models.Organization,
                as: "organization",
                attributes: [
                  "logoUrl",
                  "themeId",
                  "organizationId",
                  "name",
                  "active",
                  "contactEmail",
                  "created",
                  "lastUpdated",
                ],
              },
            ],
          },
        ],
      },
    ],
    true,
  );

  if (!inventory) {
    return null;
  }

  const organization = inventory.city?.project?.organization;
  if (!organization) {
    return null;
  }

  let theme = null;
  if (organization.themeId) {
    theme = await db.models.Theme.findByPk(organization.themeId);
  }

  return {
    organizationId: organization.organizationId,
    name: organization.name ?? "",
    logoUrl: organization.logoUrl ?? undefined,
    active: organization.active,
    contactEmail: organization.contactEmail ?? "",
    created: organization.created?.toISOString() ?? "",
    last_updated: organization.lastUpdated?.toISOString() ?? "",
    theme: {
      themeId: theme?.themeId ?? "",
      themeKey: theme?.themeKey ?? "",
    },
  };
}
