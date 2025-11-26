import { db } from "@/models";
import { getEmissionResults } from "@/backend/ResultsService";
import { fetchRanking } from "@/backend/hiap/HiapService";
import { logger } from "@/services/logger";
import { ACTION_TYPES, HighImpactActionRankingStatus, LANGUAGES } from "@/util/types";
import { ModuleService } from "@/backend/ModuleService";
import { Modules } from "@/util/constants";
import createHttpError from "http-errors";
import { Inventory } from "@/models/Inventory";
import { CcraService, TopRisksResult } from "./ccra/CcraService";
import { fetchCCRATopRisksData } from "./ccra/CcraApiService";
import { AppSession } from "@/lib/auth";
import { InventoryService } from "@/backend/InventoryService";
import { Op } from "sequelize";

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
      logger.error({ error, cityId }, "Error fetching GHGI dashboard data");
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
    session?: AppSession,
    ignoreExisting: boolean = false,
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

      // Get existing ranking data for both action types (like status API)
      const mitigationData = await this.getHIAPStatusData(
        inventory.inventoryId,
        ACTION_TYPES.Mitigation,
        lng as any,
      );

      const adaptationData = await this.getHIAPStatusData(
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
      logger.error({ error, cityId }, "Error fetching HIAP dashboard data");
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
      logger.error({ error, cityId }, "Error fetching CCRA dashboard data");
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

  /**
   * Get HIAP status data for a specific action type (mimics status API logic)
   */
  private static async getHIAPStatusData(
    inventoryId: string,
    type: ACTION_TYPES,
    lng: LANGUAGES,
  ): Promise<any> {
    try {
      const locode = await InventoryService.getLocode(inventoryId);
      
      // Find any existing ranking for this inventory/locode/type
      const ranking = await db.models.HighImpactActionRanking.findOne({
        where: {
          inventoryId,
          locode,
          type,
          langs: { [Op.contains]: [lng] }, // Check if the langs array contains this language
        },
        order: [["created", "DESC"]],
      });

      if (!ranking) {
        return { 
          status: "not_found", 
          rankedActions: [],
          rankingId: null 
        };
      }

      // Get existing actions for this language and type
      const existingActions = await db.models.HighImpactActionRanked.findAll({
        where: { 
          hiaRankingId: ranking.id, 
          lang: lng,
          type: type
        },
        order: [["rank", "ASC"]],
      });

      return {
        ...ranking.toJSON(),
        status: ranking.status || HighImpactActionRankingStatus.PENDING,
        rankedActions: existingActions,
      };
    } catch (error) {
      logger.error({
        err: error,
        inventoryId,
        type,
        lng,
      }, "Error getting HIAP status data");
      
      return {
        status: "failure",
        rankedActions: [],
        rankingId: null,
        error: `Failed to get HIAP status data: ${(error as Error).message}`,
      };
    }
  }
}
