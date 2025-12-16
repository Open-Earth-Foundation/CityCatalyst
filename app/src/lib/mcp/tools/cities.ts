import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { AppSession } from "@/lib/auth";
import { logger } from "@/services/logger";
import { ProjectService } from "@/backend/ProjectsService";

export const getUserCitiesTool: Tool = {
  name: "get_user_cities",
  description: "List all cities accessible to the authenticated user with their project and inventory information",
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
    },
  },
};

export async function execute(
  params: {
    country?: string;
    region?: string;
  },
  session: AppSession
): Promise<any> {
  try {
    const userId = session.user.id;
    logger.debug({ userId, params }, "MCP: Fetching user cities");

    // Use the existing ProjectService to get user's projects with cities
    const projects = await ProjectService.fetchUserProjects(userId);

    // Flatten cities from all projects and apply filters
    const allCities = projects.flatMap(project => 
      project.cities.map(city => ({
        cityId: city.cityId,
        name: city.name,
        country: city.country,
        locode: city.locode,
        countryLocode: city.countryLocode,
        project: {
          id: project.projectId,
          name: project.name,
        },
        inventories: {
          count: city.inventories?.length || 0,
          list: city.inventories?.map(inv => ({
            inventoryId: inv.inventoryId,
            year: inv.year,
          })) || [],
        },
      }))
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

    logger.info(
      { userId, cityCount: uniqueCities.length },
      "MCP: Successfully fetched user cities"
    );

    return {
      success: true,
      data: uniqueCities,
      count: uniqueCities.length,
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