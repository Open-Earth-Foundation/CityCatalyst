import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { AppSession } from "@/lib/auth";
import { db } from "@/models";
import { logger } from "@/services/logger";
import { InventoryService } from "@/backend/InventoryService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { Op } from "sequelize";

export const getUserInventoriesTool: Tool = {
  name: "get_user_inventories",
  description: "List GHG inventories accessible to the authenticated user. Use this tool to get inventory details, including for a specific city using the cityId parameter. Returns paginated results - check pagination.hasMore to see if there are more results, and use offset parameter to fetch the next page (e.g., offset=50 for page 2). Default limit is 50 inventories per page.",
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
      limit: {
        type: "number",
        description: "Maximum number of inventories to return (default: 50, max: 100)",
        minimum: 1,
        maximum: 100,
      },
      offset: {
        type: "number",
        description: "Number of inventories to skip for pagination (default: 0)",
        minimum: 0,
      },
      includeEmissions: {
        type: "boolean",
        description: "Include total emissions calculation (slower, default: false)",
      },
      includeDetails: {
        type: "boolean",
        description: "Include full city/project/organization details (default: false)",
      },
    },
  },
};

export async function execute(
  params: {
    cityId?: string;
    year?: number;
    includePublic?: boolean;
    limit?: number;
    offset?: number;
    includeEmissions?: boolean;
    includeDetails?: boolean;
  },
  session: AppSession
): Promise<any> {
  try {
    const userId = session.user.id;
    const limit = Math.min(params.limit || 50, 100);
    const offset = params.offset || 0;
    
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
      
      // Fetch inventories with optional includes
      const includeOptions: any[] = [];
      if (params.includeDetails) {
        includeOptions.push({
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
        });
      } else {
        includeOptions.push({
          model: db.models.City,
          as: "city",
          attributes: ["cityId", "name", "locode", "country"],
        });
      }
      
      const userInventories = await db.models.Inventory.findAll({
        where: whereConditions,
        include: includeOptions,
        order: [["year", "DESC"], ["created", "DESC"]],
        limit,
        offset,
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

    // Apply pagination
    const totalCount = inventories.length;
    const paginatedInventories = inventories.slice(offset, offset + limit);
    
    // Enrich inventories based on requested details
    const enrichedInventories = await Promise.all(
      paginatedInventories.map(async (inv) => {
        const result: any = {
          inventoryId: inv.inventoryId,
          inventoryName: inv.inventoryName,
          year: inv.year,
          isPublic: inv.isPublic,
          cityId: inv.city?.cityId,
          cityName: inv.city?.name,
          cityLocode: inv.city?.locode,
        };
        
        // Only include emissions if requested
        if (params.includeEmissions) {
          try {
            const fullInventory = await InventoryService.getInventoryWithTotalEmissions(
              inv.inventoryId,
              session
            );
            result.totalEmissions = fullInventory.totalEmissions;
          } catch (error) {
            logger.debug({ inventoryId: inv.inventoryId }, "Could not fetch emissions");
            result.totalEmissions = null;
          }
        }
        
        // Only include full details if requested
        if (params.includeDetails) {
          result.city = {
            id: inv.city?.cityId,
            name: inv.city?.name,
            country: inv.city?.country,
            region: inv.city?.region,
            locode: inv.city?.locode,
          };
          result.project = {
            id: inv.city?.project?.projectId,
            name: inv.city?.project?.name,
          };
          result.organization = {
            id: inv.city?.project?.organization?.organizationId,
            name: inv.city?.project?.organization?.name,
            active: inv.city?.project?.organization?.active,
          };
          result.created = inv.created;
          result.lastUpdated = inv.lastUpdated;
        }
        
        return result;
      })
    );

    logger.info(
      { userId, count: enrichedInventories.length },
      "MCP: Successfully fetched inventories"
    );

    return {
      success: true,
      data: enrichedInventories,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
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