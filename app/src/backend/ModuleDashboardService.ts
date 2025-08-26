import { db } from "@/models";
import { getEmissionResults } from "@/backend/ResultsService";
import InventoryProgressService from "@/backend/InventoryProgressService";
import { fetchRanking } from "@/backend/hiap/HiapService";
import { logger } from "@/services/logger";
import { ACTION_TYPES } from "@/util/types";

export class ModuleDashboardService {
  /**
   * Get GHGI module dashboard data
   */
  public static async getGHGIDashboardData(cityId: string): Promise<any> {
    try {
      // Get most recent inventory for the city
      const inventory = await db.models.Inventory.findOne({
        where: { cityId },
        order: [["year", "DESC"]],
        limit: 1,
      });

      if (!inventory) {
        logger.info(`No inventory found for city ${cityId}`);
        return { error: "No inventory found" };
      }

      logger.info(
        `Found inventory ${inventory.inventoryId} for city ${cityId}, year ${inventory.year}`,
      );

      // Get emissions results
      const emissionResults = await getEmissionResults(inventory?.inventoryId);
      
      const {
        totalEmissionsBySector = [],
        topEmissionsBySubSector = [],
        totalEmissions = 0,
      } = emissionResults || {};

      return {
        totalEmissions: {
          bySector: totalEmissionsBySector,
          total: totalEmissions,
        },
        topEmissions: { bySubSector: topEmissionsBySubSector },
        inventory,
        year: inventory.year,
      };
    } catch (error) {
      logger.error("Error fetching GHGI dashboard data:", { error, cityId });
      return {
        error: `Failed to fetch GHGI data: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get HIAP module dashboard data
   */
  public static async getHIAPDashboardData(
    cityId: string,
    lng: string = "en",
  ): Promise<any> {
    try {
      // Get most recent inventory for the city
      const inventory = await db.models.Inventory.findOne({
        where: { cityId },
        order: [["year", "DESC"]],
        limit: 1,
      });

      if (!inventory) {
        return { error: "No inventory found" };
      }

      // Get high impact action plan data
      const mitigationData = await fetchRanking(
        inventory.inventoryId,
        ACTION_TYPES.Mitigation,
        lng as any,
      );

      const adaptationData = await fetchRanking(
        inventory.inventoryId,
        ACTION_TYPES.Adaptation,
        lng as any,
      );

      return {
        mitigation: mitigationData,
        adaptation: adaptationData,
        inventoryId: inventory.inventoryId,
      };
    } catch (error) {
      logger.error("Error fetching HIAP dashboard data:", { error, cityId });
      return {
        error: `Failed to fetch HIAP data: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get dashboard data for all enabled modules in a city
   */
  public static async getCityDashboardData(
    cityId: string,
    projectId: string,
    lng: string = "en",
  ): Promise<Record<string, any>> {
    // Use ModuleService to get enabled modules for this project
    const { ModuleService } = await import("./ModuleService");
    const enabledModules =
      await ModuleService.getEnabledProjectModules(projectId);

    const dashboardData: Record<string, any> = {};

    // For each enabled module, get its dashboard data
    for (const enabledModule of enabledModules) {
      const moduleId = enabledModule.id;
      const moduleUrl = enabledModule.url;

      logger.info(
        `Fetching dashboard data for module ${moduleId} (${moduleUrl})`,
      );

      try {
        switch (moduleUrl) {
          case "/GHGI":
            dashboardData[moduleId] = await this.getGHGIDashboardData(cityId);
            break;
          case "/HIAP":
            dashboardData[moduleId] = await this.getHIAPDashboardData(
              cityId,
              lng,
            );
            break;
          default:
            // For unknown modules, return basic info
            dashboardData[moduleId] = {
              moduleId,
              moduleName: enabledModule.name,
              moduleUrl,
              available: true,
            };
        }
      } catch (error) {
        // Module fails individually - don't break the whole response
        logger.error(
          `Failed to fetch dashboard data for module ${moduleId}:`,
          error,
        );
        dashboardData[moduleId] = {
          error: (error as Error).message || "Failed to load module data",
          moduleId,
          moduleName: enabledModule.name,
        };
      }
    }

    return dashboardData;
  }
}
