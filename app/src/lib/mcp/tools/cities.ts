import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { AppSession } from "@/lib/auth";
import { logger } from "@/services/logger";
import { ProjectService } from "@/backend/ProjectsService";

export const getUserCitiesTool: Tool = {
  name: "get_user_cities",
  description: "List cities accessible to the authenticated user. Returns paginated results - check pagination.hasMore to see if there are more results, and use offset parameter to fetch the next page. Default limit is 50 cities per page.",
  inputSchema: {
    type: "object",
    properties: {
      country: {
        type: "string",
        description: "Filter cities by country",
      },
      region: {
        type: "string", 
        description: "Filter cities by region",
      },
      limit: {
        type: "number",
        description: "Maximum number of cities to return (default: 50, max: 100)",
        minimum: 1,
        maximum: 100,
      },
      offset: {
        type: "number",
        description: "Number of cities to skip for pagination (default: 0)",
        minimum: 0,
      },
      includeInventories: {
        type: "boolean",
        description: "Include basic inventory list (just ID and year). For full inventory details, use get_user_inventories tool instead (default: false)",
      },
    },
  },
};

export async function execute(
  params: {
    country?: string;
    region?: string;
    limit?: number;
    offset?: number;
    includeInventories?: boolean;
  },
  session: AppSession
): Promise<any> {
  try {
    const userId = session.user.id;
    const limit = Math.min(params.limit || 50, 100);
    const offset = params.offset || 0;
    
    logger.debug({ userId, params }, "MCP: Fetching user cities");

    // Use the existing ProjectService to get user's projects with cities
    const projects = await ProjectService.fetchUserProjects(userId);

    // Flatten cities from all projects and apply filters
    const allCities = projects.flatMap(project => 
      project.cities.map(city => {
        const cityData: any = {
          cityId: city.cityId,
          name: city.name,
          country: city.country,
          locode: city.locode,
          countryLocode: city.countryLocode,
          projectId: project.projectId,
          projectName: project.name,
        };
        
        // Only include inventory details if requested
        if (params.includeInventories) {
          cityData.inventories = {
            count: city.inventories?.length || 0,
            list: city.inventories?.map(inv => ({
              inventoryId: inv.inventoryId,
              year: inv.year,
            })) || [],
          };
        } else {
          cityData.inventoryCount = city.inventories?.length || 0;
        }
        
        return cityData;
      })
    );

    // Apply filters
    let filteredCities = allCities;
    
    if (params.country) {
      filteredCities = filteredCities.filter(city => 
        city.country?.toLowerCase().includes(params.country!.toLowerCase())
      );
    }
    
    // Note: ProjectService.fetchUserProjects doesn't include region data
    // Region filtering would need to be implemented by enhancing the ProjectService
    if (params.region) {
      logger.warn({ region: params.region }, "Region filtering not supported - ProjectService doesn't include region data");
    }

    // Remove duplicates (user might have access to same city through multiple roles)
    const uniqueCities = filteredCities.reduce((unique, city) => {
      if (!unique.find(c => c.cityId === city.cityId)) {
        unique.push(city);
      }
      return unique;
    }, [] as typeof filteredCities);

    // Apply pagination
    const totalCount = uniqueCities.length;
    const paginatedCities = uniqueCities.slice(offset, offset + limit);

    logger.info(
      { userId, cityCount: paginatedCities.length, totalCount },
      "MCP: Successfully fetched user cities"
    );

    return {
      success: true,
      data: paginatedCities,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
      summary: {
        totalProjects: projects.length,
        totalCitiesBeforeFilter: allCities.length,
        totalCitiesAfterFilter: uniqueCities.length,
      },
    };
  } catch (error) {
    logger.error({ error }, "MCP: Error fetching user cities");
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch cities",
      data: [],
    };
  }
}