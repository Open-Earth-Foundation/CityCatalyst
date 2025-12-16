import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { AppSession } from "@/lib/auth";
import { db } from "@/models";
import { logger } from "@/services/logger";
import { InventoryService } from "@/backend/InventoryService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { Op } from "sequelize";

export const getUserInventoriesTool: Tool = {
  name: "get_user_inventories",
  description: "List all GHG inventories accessible to the authenticated user",
  inputSchema: {
    type: "object",
    properties: {
      cityId: {
        type: "string",
        description: "Optional: Filter inventories by city ID",
      },
      year: {
        type: "number", 
        description: "Optional: Filter inventories by specific year",
      },
      includePublic: {
        type: "boolean",
        description: "Include public inventories from other cities (default: false)",
      },
    },
  },
};

export async function execute(
  params: {
    cityId?: string;
    year?: number;
    includePublic?: boolean;
  },
  session: AppSession
): Promise<any> {
  try {
    const userId = session.user.id;
    logger.debug({ userId, params }, "MCP: Fetching user inventories");

    // Get all accessible inventories using permission service
    const inventories = [];
    
    if (params.cityId) {
      // Check if user can access this specific city
      try {
        const access = await PermissionService.canAccessCity(session, params.cityId);
        if (access.hasAccess) {
          // Fetch inventories for this city
          const cityInventories = await db.models.Inventory.findAll({
            where: {
              cityId: params.cityId,
              ...(params.year && { year: params.year }),
            },
            include: [{
              model: db.models.City,
              as: "city",
              include: [{
                model: db.models.Project,
                as: "project",
                include: [{
                  model: db.models.Organization,
                  as: "organization",
                }],
              }],
            }],
          });
          inventories.push(...cityInventories);
        }
      } catch (error) {
        logger.debug({ error, cityId: params.cityId }, "City access check failed");
        // If no access to specified city, return empty unless including public
        if (!params.includePublic) {
          return {
            success: false,
            error: "Access denied to specified city",
            data: [],
          };
        }
      }
    } else {
      // Get all cities user has access to
      const userCities = await db.models.CityUser.findAll({
        where: { userId },
        attributes: ["cityId"],
      });
      
      const cityIds = userCities.map(uc => uc.cityId);
      
      // Build query conditions
      const whereConditions: any = {};
      
      if (params.includePublic) {
        whereConditions[Op.or] = [
          { cityId: { [Op.in]: cityIds } },
          { isPublic: true }
        ];
      } else {
        whereConditions.cityId = { [Op.in]: cityIds };
      }
      
      if (params.year) {
        whereConditions.year = params.year;
      }
      
      // Fetch inventories
      const userInventories = await db.models.Inventory.findAll({
        where: whereConditions,
        include: [{
          model: db.models.City,
          as: "city",
          include: [{
            model: db.models.Project,
            as: "project",
            include: [{
              model: db.models.Organization,
              as: "organization",
            }],
          }],
        }],
        order: [["year", "DESC"], ["created", "DESC"]],
      });
      
      inventories.push(...userInventories);
    }

    // Add public inventories if requested
    if (params.includePublic && !params.cityId) {
      const publicInventories = await db.models.Inventory.findAll({
        where: {
          isPublic: true,
          ...(params.year && { year: params.year }),
        },
        include: [{
          model: db.models.City,
          as: "city",
          include: [{
            model: db.models.Project,
            as: "project",
            include: [{
              model: db.models.Organization,
              as: "organization",
            }],
          }],
        }],
        order: [["year", "DESC"], ["created", "DESC"]],
      });
      
      // Merge and deduplicate
      const existingIds = new Set(inventories.map(inv => inv.inventoryId));
      publicInventories.forEach(inv => {
        if (!existingIds.has(inv.inventoryId)) {
          inventories.push(inv);
        }
      });
    }

    // Enrich inventories with total emissions using the service
    const enrichedInventories = await Promise.all(
      inventories.map(async (inv) => {
        let totalEmissions = null;
        try {
          const fullInventory = await InventoryService.getInventoryWithTotalEmissions(
            inv.inventoryId,
            session
          );
          totalEmissions = fullInventory.totalEmissions;
        } catch (error) {
          // Permission denied or error getting emissions
          logger.debug({ inventoryId: inv.inventoryId }, "Could not fetch emissions");
        }

        return {
          inventoryId: inv.inventoryId,
          inventoryName: inv.inventoryName,
          year: inv.year,
          totalEmissions,
          isPublic: inv.isPublic,
          city: {
            id: inv.city?.cityId,
            name: inv.city?.name,
            country: inv.city?.country,
            region: inv.city?.region,
            locode: inv.city?.locode,
          },
          project: {
            id: inv.city?.project?.projectId,
            name: inv.city?.project?.name,
          },
          organization: {
            id: inv.city?.project?.organization?.organizationId,
            name: inv.city?.project?.organization?.name,
            active: inv.city?.project?.organization?.active,
          },
          created: inv.created,
          lastUpdated: inv.lastUpdated,
        };
      })
    );

    logger.info(
      { userId, count: enrichedInventories.length },
      "MCP: Successfully fetched inventories"
    );

    return {
      success: true,
      data: enrichedInventories,
      count: enrichedInventories.length,
    };
  } catch (error) {
    logger.error({ error }, "MCP: Error fetching inventories");
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch inventories",
      data: [],
    };
  }
}