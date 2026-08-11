import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { AppSession } from "@/lib/auth";
import { logger } from "@/services/logger";
import { PermissionService } from "@/backend/permissions/PermissionService";
import UserService from "@/backend/UserService";
import PopulationService from "@/backend/PopulationService";
import { db } from "@/models";
import { QueryTypes } from "sequelize";

export const getCityProfileTool: Tool = {
  name: "get_city_profile",
  description:
    "Get comprehensive profile information for a specific city including demographics, inventories, and organizational details",
  inputSchema: {
    type: "object",
    properties: {
      cityId: {
        type: "string",
        description: "The city ID to get profile information for",
      },
    },
    required: ["cityId"],
  },
};

interface CityProfile {
  cityId: string;
  name?: string;
  country?: string;
  region?: string;
  locode?: string;
  area?: number;
  project: {
    id?: string;
    name?: string;
    description?: string;
  };
  organization: {
    id?: string;
    name?: string;
  };
  demographics: {
    latestPopulation: { year?: number | null; count: number } | null;
  };
  inventoryStatistics: {
    totalInventories: number;
    publicInventories: number;
    privateInventories: number;
    yearRange: {
      earliest: number | null;
      latest: number | null;
    };
    totalEmissionsAllYears: number;
  };
  recentInventories: {
    inventoryId: string;
    inventoryName?: string;
    year?: number;
    totalEmissions?: number | null;
    isPublic?: boolean;
    created?: Date;
    lastUpdated?: Date | null;
  }[];
  collaborators: {
    userId?: string;
    name?: string;
    email?: string;
    title?: string;
  }[];
  metadata: {
    created?: Date;
    lastUpdated?: Date;
    hasGeometry: boolean;
  };
}

export async function execute(
  params: {
    cityId: string;
  },
  session: AppSession,
): Promise<
  | { success: true; data: CityProfile }
  | { success: false; error: string; data: null }
> {
  try {
    const { cityId } = params;
    const userId = session.user.id;

    logger.debug({ userId, cityId }, "MCP: Fetching city profile");

    // Check access permission using existing service
    const { resource: city, hasAccess } = await PermissionService.canAccessCity(
      session,
      cityId,
    );

    if (!hasAccess || !city) {
      return {
        success: false,
        error: "Access denied to this city or city not found",
        data: null,
      };
    }

    // Get detailed city information using UserService
    const detailedCity = await UserService.findUserCity(cityId, session, true);

    // Get most recent population data using PopulationService
    const latestPopulation = await PopulationService.getMostRecentPopulationDataForCity(cityId);

    // Get inventory statistics
    interface InventoryStatsRow {
      total_inventories: string;
      public_inventories: string;
      earliest_year: number | null;
      latest_year: number | null;
      total_emissions_all_years: string | null;
    }

    const inventoryStats = await db.sequelize?.query<InventoryStatsRow>(
      `
      SELECT
        COUNT(*) as total_inventories,
        COUNT(CASE WHEN is_public = true THEN 1 END) as public_inventories,
        MIN(year) as earliest_year,
        MAX(year) as latest_year,
        SUM(total_emissions) as total_emissions_all_years
      FROM "Inventory"
      WHERE city_id = :cityId
    `,
      {
        replacements: { cityId },
        type: QueryTypes.SELECT,
      },
    );

    const stats = inventoryStats?.[0] || {
      total_inventories: "0",
      public_inventories: "0",
      earliest_year: null,
      latest_year: null,
      total_emissions_all_years: null,
    };

    // Get recent inventories with details
    const recentInventories = await db.models.Inventory.findAll({
      where: { cityId },
      order: [
        ["year", "DESC"],
        ["lastUpdated", "DESC"],
      ],
      limit: 5,
      attributes: [
        "inventoryId",
        "inventoryName",
        "year",
        "totalEmissions",
        "isPublic",
        "created",
        "lastUpdated",
      ],
    });

    // Get city users (collaborators)
    const cityUsers = await db.models.CityUser.findAll({
      where: { cityId },
      include: [
        {
          model: db.models.User,
          as: "user",
          attributes: ["userId", "name", "email", "title"],
        },
      ],
    });

    const cityProfile: CityProfile = {
      cityId: detailedCity.cityId,
      name: detailedCity.name,
      country: detailedCity.country,
      region: detailedCity.region,
      locode: detailedCity.locode,
      area: detailedCity.area,
      project: {
        id: detailedCity.project?.projectId,
        name: detailedCity.project?.name,
        description: detailedCity.project?.description,
      },
      organization: {
        id: detailedCity.project?.organization?.organizationId,
        name: detailedCity.project?.organization?.name,
      },
      demographics: {
        latestPopulation: latestPopulation.population
          ? {
              year: latestPopulation.year,
              count: latestPopulation.population,
            }
          : null,
      },
      inventoryStatistics: {
        totalInventories: parseInt(stats.total_inventories || "0"),
        publicInventories: parseInt(stats.public_inventories || "0"),
        privateInventories:
          parseInt(stats.total_inventories || "0") -
          parseInt(stats.public_inventories || "0"),
        yearRange: {
          earliest: stats.earliest_year,
          latest: stats.latest_year,
        },
        totalEmissionsAllYears: parseFloat(
          stats.total_emissions_all_years || "0",
        ),
      },
      recentInventories: recentInventories.map((inv) => ({
        inventoryId: inv.inventoryId,
        inventoryName: inv.inventoryName,
        year: inv.year,
        totalEmissions: inv.totalEmissions,
        isPublic: inv.isPublic,
        created: inv.created,
        lastUpdated: inv.lastUpdated,
      })),
      collaborators: cityUsers.map((cu) => ({
        userId: cu.user?.userId,
        name: cu.user?.name,
        email: cu.user?.email,
        title: cu.user?.title,
      })),
      metadata: {
        created: detailedCity.created,
        lastUpdated: detailedCity.lastUpdated,
        hasGeometry: !!detailedCity.shape,
      },
    };

    logger.info(
      {
        userId,
        cityId,
        inventoryCount: cityProfile.inventoryStatistics.totalInventories,
      },
      "MCP: Successfully fetched city profile",
    );

    return {
      success: true,
      data: cityProfile,
    };
  } catch (error) {
    logger.error(
      { error, cityId: params.cityId },
      "MCP: Error fetching city profile",
    );
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch city profile",
      data: null,
    };
  }
}
