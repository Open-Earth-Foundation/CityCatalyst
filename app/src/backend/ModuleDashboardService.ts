import { db } from "@/models";
import { getEmissionResults } from "@/backend/ResultsService";
import { fetchRanking } from "@/backend/hiap/HiapService";
import { logger } from "@/services/logger";
import { ACTION_TYPES } from "@/util/types";
import { ModuleService } from "@/backend/ModuleService";
import { Modules } from "@/util/constants";
import createHttpError from "http-errors";
import { Inventory } from "@/models/Inventory";
import { CcraService, TopRisksResult } from "./ccra/CcraService";
import { fetchCCRATopRisksData } from "./ccra/CcraApiService";

export class ModuleDashboardService {
  /**
   * Get GHGI module dashboard data
   */
  public static async getGHGIDashboardData(
    cityId: string,
    inventory: Inventory,
  ): Promise<any> {
    try {
      const city = await db.models.City.findOne({
        where: { cityId },
      });

      if (!city) {
        throw new createHttpError.NotFound("city-not-found");
      }

      // Check if the project has access to the GHGI module
      const hasModuleAccess = await ModuleService.hasModuleAccess(
        city.projectId as string,
        Modules.GHGI.id,
      );

      if (!hasModuleAccess) {
        throw new createHttpError.Forbidden("module-access-denied-ghgi");
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
      if (error instanceof createHttpError.HttpError) {
        throw error;
      }
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
    inventory: Inventory,
    lng: string = "en",
  ): Promise<any> {
    try {
      const city = await db.models.City.findOne({
        where: { cityId },
      });

      if (!city) {
        throw new createHttpError.NotFound("city-not-found");
      }

      // Check if the project has access to the HIAP module
      const hasModuleAccess = await ModuleService.hasModuleAccess(
        city.projectId as string,
        Modules.HIAP.id,
      );

      if (!hasModuleAccess) {
        throw new createHttpError.Forbidden("module-access-denied-hiap");
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

  public static async getCCRADashboardData(
    cityId: string,
    inventory: Inventory,
    resilienceScore?: number | null,
  ): Promise<TopRisksResult & { inventoryId: string }> {
    try {
      const city = await db.models.City.findOne({
        where: { cityId },
      });

      if (!city) {
        throw new createHttpError.NotFound("city-not-found");
      }

      // Check module access
      const hasModuleAccess = await ModuleService.hasModuleAccess(
        city.projectId as string,
        Modules.CCRA.id,
      );

      if (!hasModuleAccess) {
        throw new createHttpError.Forbidden("module-access-denied-ccra");
      }

      logger.info(`Fetching CCRA top risks for inventory ${city.locode}`);

      // Fetch CCRA data
      const ccraData = await fetchCCRATopRisksData(city.locode as string);

      // Process top risks (default to top 3)
      const topRisksResult = CcraService.processTopRisks(
        ccraData,
        3,
        resilienceScore,
      );

      logger.info(
        `Successfully processed CCRA top risks for inventory ${inventory.inventoryId}`,
      );

      return {
        ...topRisksResult,
        inventoryId: inventory.inventoryId,
      };
    } catch (error) {
      logger.error("Error fetching CCRA dashboard data:", { error, cityId });
      if (error instanceof createHttpError.HttpError) {
        throw error;
      }
      return {
        topRisks: [],
        inventoryId: inventory.inventoryId,
        error: `Failed to fetch CCRA data: ${(error as Error).message}`,
      } as any;
    }
  }
}
