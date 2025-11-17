import { db } from "@/models";
import { logger } from "@/services/logger";
import {
  ACTION_TYPES,
  LANGUAGES,
  HighImpactActionRankingStatus,
} from "@/util/types";
import { hiapServiceWrapper, checkBulkActionRankingJob } from "./HiapService";
import { HiapApiService } from "./HiapApiService";
import { Op, QueryTypes } from "sequelize";

interface CityInventoryData {
  cityId: string;
  inventoryId: string;
  locode: string;
  cityName: string;
}

interface BulkPrioritizationParams {
  projectId: string;
  year: number;
  actionType: ACTION_TYPES;
  languages: LANGUAGES[];
}

interface BulkPrioritizationResult {
  totalCities: number;
  totalBatches: number;
  successfulCities: number;
  failedCities: number;
  batchResults: Array<{
    batchNumber: number;
    taskId: string;
    cityCount: number;
    status: "completed" | "failed";
    error?: string;
  }>;
}

export class BulkHiapPrioritizationService {
  // Process up to 100 cities per batch (configurable for testing)
  static BATCH_SIZE = 100;
  /**
   * Start bulk HIAP prioritization
   * Creates ranking records for all cities and starts the first batch
   * Subsequent batches will be started by the cron job
   */
  static async startBulkPrioritizationAsync(
    params: BulkPrioritizationParams,
  ): Promise<{ totalCities: number; firstBatchSize: number }> {
    const { projectId, year, actionType, languages } = params;

    logger.info(
      { projectId, year, actionType, languages },
      "Starting bulk HIAP prioritization",
    );

    // Step 1: Fetch all cities with inventories
    const citiesData = await this.fetchCitiesWithInventories(projectId, year);

    if (citiesData.length === 0) {
      logger.info(
        { projectId, year },
        "No cities with inventories found for bulk HIAP",
      );
      return {
        totalCities: 0,
        firstBatchSize: 0,
      };
    }

    logger.info(
      { projectId, year, cityCount: citiesData.length },
      "Fetched cities for bulk HIAP",
    );

    // Step 2: Create HighImpactActionRanking records for ALL cities with TO_DO status
    await this.createRankingRecords(citiesData, actionType, languages);

    // Step 3: Process ONLY the first batch
    const firstBatchSize = Math.min(
      BulkHiapPrioritizationService.BATCH_SIZE,
      citiesData.length,
    );
    const firstBatch = citiesData.slice(0, firstBatchSize);

    logger.info(
      {
        projectId,
        totalCities: citiesData.length,
        firstBatchSize,
      },
      "Starting first batch",
    );

    await this.processBatch(firstBatch, actionType, languages, 1);

    logger.info(
      {
        projectId,
        totalCities: citiesData.length,
        firstBatchSize,
      },
      "First batch started successfully. Cron job will process remaining batches.",
    );

    return {
      totalCities: citiesData.length,
      firstBatchSize,
    };
  }

  /**
   * Start the next TO_DO batch for a given project and action type
   * Called by the cron job to continue processing
   */
  static async startNextBatch(
    projectId: string,
    actionType: ACTION_TYPES,
  ): Promise<{ started: boolean; batchSize: number; taskId?: string }> {
    // Step 1: Find TO_DO ranking IDs for this project (with limit)
    // We do a two-step query to ensure LIMIT works correctly with eager loading
    const rankingIds = await db.sequelize!.query<{ id: string }>(
      `
      SELECT har.id
      FROM "public"."HighImpactActionRanking" har
      INNER JOIN "public"."Inventory" inv ON har.inventory_id = inv.inventory_id
      INNER JOIN "public"."City" c ON inv.city_id = c.city_id
      WHERE har.status = :status
        AND har.type = :type
        AND c.project_id = :projectId
      ORDER BY har.id ASC
      LIMIT :limit
      `,
      {
        replacements: {
          status: HighImpactActionRankingStatus.TO_DO,
          type: actionType,
          projectId,
          limit: BulkHiapPrioritizationService.BATCH_SIZE,
        },
        type: QueryTypes.SELECT,
      },
    );

    if (rankingIds.length === 0) {
      logger.info(
        { projectId, actionType },
        "No more TO_DO rankings to process",
      );
      return { started: false, batchSize: 0 };
    }

    // Step 2: Fetch full ranking objects with includes
    const todoRankings = await db.models.HighImpactActionRanking.findAll({
      where: {
        id: { [Op.in]: rankingIds.map((r) => r.id) },
      },
      include: [
        {
          model: db.models.Inventory,
          as: "inventory",
          required: true,
          include: [
            {
              model: db.models.City,
              as: "city",
              required: true,
            },
          ],
        },
      ],
      order: [["id", "ASC"]],
    });

    if (todoRankings.length === 0) {
      logger.info(
        { projectId, actionType },
        "No more TO_DO rankings to process",
      );
      return { started: false, batchSize: 0 };
    }

    // Build cities data for the batch
    const citiesData: CityInventoryData[] = todoRankings.map((ranking) => {
      const inventory = (ranking as any).inventory;
      const city = inventory.city;
      return {
        cityId: city.cityId,
        inventoryId: ranking.inventoryId,
        locode: ranking.locode,
        cityName: city.name || ranking.locode,
      };
    });

    const languages = todoRankings[0].langs as LANGUAGES[];

    logger.info(
      {
        projectId,
        actionType,
        batchSize: citiesData.length,
        languages,
      },
      "Starting next TO_DO batch",
    );

    const result = await this.processBatch(
      citiesData,
      actionType,
      languages,
      0, // batchNumber not used for logging in cron context
    );

    return {
      started: true,
      batchSize: citiesData.length,
      taskId: result.taskId,
    };
  }

  /**
   * Mark specific cities as EXCLUDED to prevent them from being retried
   * Used when certain cities cause entire batches to fail
   */
  private static async excludeCitiesFromRetry(params: {
    projectId: string;
    actionType: ACTION_TYPES;
    cityLocodes: string[];
    jobIds?: string[];
  }): Promise<number> {
    const { projectId, actionType, cityLocodes, jobIds } = params;

    if (!db.sequelize) {
      throw new Error("Database not initialized");
    }

    const whereConditions: string[] = [
      `har.status = :status`,
      `har.type = :actionType`,
      `c.project_id = :projectId`,
      `c.locode = ANY(ARRAY[:cityLocodes])`,
    ];

    const replacements: any = {
      status: HighImpactActionRankingStatus.FAILURE,
      actionType,
      projectId,
      cityLocodes,
    };

    if (jobIds && jobIds.length > 0) {
      whereConditions.push(`har.job_id = ANY(ARRAY[:jobIds])`);
      replacements.jobIds = jobIds;
    }

    // Mark excluded cities as EXCLUDED so they won't be retried
    const result = await db.sequelize.query(
      `
      UPDATE "HighImpactActionRanking" har
      SET 
        status = :excludedStatus,
        job_id = NULL,
        error_message = 'City excluded from retry - caused batch failure'
      FROM "Inventory" inv
      JOIN "City" c ON inv.city_id = c.city_id
      WHERE har.inventory_id = inv.inventory_id
        AND ${whereConditions.join(" AND ")}
      `,
      {
        replacements: {
          ...replacements,
          excludedStatus: HighImpactActionRankingStatus.EXCLUDED,
        },
        type: QueryTypes.UPDATE,
      },
    );

    const excludedCount = (result as any)[1] || 0;

    logger.info(
      { excludedCount, cityLocodes },
      "Excluded problematic cities from retry",
    );

    return excludedCount;
  }

  /**
   * Retry failed batches by resetting them to TO_DO status
   * Can exclude specific cities that are causing batch failures
   */
  static async retryFailedBatches(params: {
    projectId: string;
    actionType: ACTION_TYPES;
    jobIds?: string[];
    excludedCityLocodes?: string[];
  }): Promise<{ retriedCount: number; excludedCount: number }> {
    const { projectId, actionType, jobIds, excludedCityLocodes } = params;

    logger.info(
      { projectId, actionType, jobIds, excludedCityLocodes },
      "Retrying failed HIAP batches",
    );

    if (!db.sequelize) {
      throw new Error("Database not initialized");
    }

    // Exclude specific cities if requested
    let excludedCount = 0;
    if (excludedCityLocodes && excludedCityLocodes.length > 0) {
      excludedCount = await this.excludeCitiesFromRetry({
        projectId,
        actionType,
        cityLocodes: excludedCityLocodes,
        jobIds,
      });
    }

    // Build WHERE clause for cities to retry
    const whereConditions: string[] = [
      `har.status = :status`,
      `har.type = :actionType`,
      `c.project_id = :projectId`,
    ];

    const replacements: any = {
      status: HighImpactActionRankingStatus.FAILURE,
      actionType,
      projectId,
    };

    if (jobIds && jobIds.length > 0) {
      whereConditions.push(`har.job_id = ANY(ARRAY[:jobIds])`);
      replacements.jobIds = jobIds;
    }

    // Exclude cities that were marked as excluded
    if (excludedCityLocodes && excludedCityLocodes.length > 0) {
      whereConditions.push(`c.locode != ALL(ARRAY[:excludedCityLocodes])`);
      replacements.excludedCityLocodes = excludedCityLocodes;
    }

    // Use raw SQL to update with JOIN
    const result = await db.sequelize.query(
      `
      UPDATE "HighImpactActionRanking" har
      SET 
        status = :newStatus,
        job_id = NULL,
        error_message = NULL
      FROM "Inventory" inv
      JOIN "City" c ON inv.city_id = c.city_id
      WHERE har.inventory_id = inv.inventory_id
        AND ${whereConditions.join(" AND ")}
      `,
      {
        replacements: {
          ...replacements,
          newStatus: HighImpactActionRankingStatus.TO_DO,
        },
        type: QueryTypes.UPDATE,
      },
    );

    // Result is [undefined, rowCount] for UPDATE queries
    const retriedCount = (result as any)[1] || 0;

    logger.info(
      { retriedCount, excludedCount, projectId, actionType },
      "Reset failed rankings to TO_DO",
    );

    return { retriedCount, excludedCount };
  }

  /**
   * Un-exclude cities by moving them from EXCLUDED back to TO_DO status
   */
  static async unexcludeCities(params: {
    projectId: string;
    actionType: ACTION_TYPES;
    cityLocodes: string[];
  }): Promise<{ unexcludedCount: number }> {
    const { projectId, actionType, cityLocodes } = params;

    logger.info(
      { projectId, actionType, cityLocodes },
      "Un-excluding cities - moving from EXCLUDED to TO_DO",
    );

    if (!db.sequelize) {
      throw new Error("Database not initialized");
    }

    if (!cityLocodes || cityLocodes.length === 0) {
      return { unexcludedCount: 0 };
    }

    // Move excluded cities back to TO_DO
    const result = await db.sequelize.query(
      `
      UPDATE "HighImpactActionRanking" har
      SET 
        status = :toDoStatus,
        error_message = NULL
      FROM "Inventory" inv
      JOIN "City" c ON inv.city_id = c.city_id
      WHERE har.inventory_id = inv.inventory_id
        AND har.status = :excludedStatus
        AND har.type = :actionType
        AND c.project_id = :projectId
        AND c.locode = ANY(ARRAY[:cityLocodes])
      `,
      {
        replacements: {
          toDoStatus: HighImpactActionRankingStatus.TO_DO,
          excludedStatus: HighImpactActionRankingStatus.EXCLUDED,
          actionType,
          projectId,
          cityLocodes,
        },
        type: QueryTypes.UPDATE,
      },
    );

    const unexcludedCount = (result as any)[1] || 0;

    logger.info(
      { unexcludedCount, projectId, actionType },
      "Cities moved from EXCLUDED to TO_DO",
    );

    return { unexcludedCount };
  }

  /**
   * Get batch status information for a project
   * Returns batches grouped by jobId with city details
   */
  static async getBatchStatus(params: {
    projectId: string;
    actionType: ACTION_TYPES;
  }): Promise<
    Array<{
      jobId: string | null;
      status: string;
      cityCount: number;
      cities: Array<{
        locode: string;
        inventoryId: string;
        status: string;
        errorMessage: string | null;
      }>;
    }>
  > {
    const { projectId, actionType } = params;

    if (!db.sequelize) {
      throw new Error("Database not initialized");
    }

    // Fetch all rankings for this project and action type
    const rankings = await db.models.HighImpactActionRanking.findAll({
      include: [
        {
          model: db.models.Inventory,
          as: "inventory",
          required: true,
          include: [
            {
              model: db.models.City,
              as: "city",
              required: true,
              where: { projectId },
              attributes: ["cityId", "name", "locode"],
            },
          ],
          attributes: ["inventoryId"],
        },
      ],
      where: { type: actionType },
      order: [["created", "ASC"]],
    });

    // Group by jobId (null jobIds = TO_DO batch)
    const batchMap = new Map<
      string,
      {
        jobId: string | null;
        status: string;
        cityCount: number;
        cities: Array<{
          locode: string;
          inventoryId: string;
          status: string;
          errorMessage: string | null;
        }>;
      }
    >();

    for (const ranking of rankings) {
      const jobId = ranking.jobId || "TO_DO";
      const status = ranking.status || HighImpactActionRankingStatus.TO_DO;

      if (!batchMap.has(jobId)) {
        batchMap.set(jobId, {
          jobId: ranking.jobId || null,
          status: status,
          cityCount: 0,
          cities: [],
        });
      }

      const batch = batchMap.get(jobId)!;
      batch.cityCount++;
      batch.cities.push({
        locode: ranking.locode,
        inventoryId: ranking.inventoryId,
        status: status,
        errorMessage: ranking.errorMessage || null,
      });

      // If batch has mixed statuses, use a summary status
      if (batch.cities.some((c) => c.status !== batch.status)) {
        batch.status = "MIXED";
      }
    }

    return Array.from(batchMap.values());
  }

  /**
   * Fetch all cities with inventories for the specified year
   */
  private static async fetchCitiesWithInventories(
    projectId: string,
    year: number,
  ): Promise<CityInventoryData[]> {
    const citiesWithInventories = await db.models.City.findAll({
      where: { projectId },
      include: [
        {
          model: db.models.Inventory,
          as: "inventories",
          where: { year },
          required: true,
          attributes: ["inventoryId", "year"],
        },
      ],
      attributes: ["cityId", "name", "locode"],
    });

    const citiesData: CityInventoryData[] = [];

    for (const city of citiesWithInventories) {
      // Verify inventory exists for exact year
      const inventory = await db.models.Inventory.findOne({
        where: { cityId: city.cityId, year },
        attributes: ["inventoryId", "year"],
      });

      if (!inventory) {
        logger.info(
          {
            cityId: city.cityId,
            cityName: city.name ?? city.locode ?? "Unknown",
            year,
          },
          "Skipping city: no inventory for requested year",
        );
        continue;
      }

      if (!city.locode) {
        logger.warn(
          {
            cityId: city.cityId,
            cityName: city.name ?? "Unknown",
          },
          "Skipping city: no locode",
        );
        continue;
      }

      citiesData.push({
        cityId: city.cityId,
        inventoryId: inventory.inventoryId,
        locode: city.locode,
        cityName: city.name ?? city.locode,
      });
    }

    return citiesData;
  }

  /**
   * Create HighImpactActionRanking records for all cities
   * These are created upfront with null jobId and TO_DO status
   */
  private static async createRankingRecords(
    citiesData: CityInventoryData[],
    actionType: ACTION_TYPES,
    languages: LANGUAGES[],
  ): Promise<void> {
    logger.info(
      { cityCount: citiesData.length, actionType },
      "Creating ranking records with TO_DO status",
    );

    // Check which rankings already exist
    const existingRankings = await db.models.HighImpactActionRanking.findAll({
      where: {
        inventoryId: { [Op.in]: citiesData.map((c) => c.inventoryId) },
        type: actionType,
      },
      attributes: ["inventoryId"],
    });

    const existingInventoryIds = new Set(
      existingRankings.map((r) => r.inventoryId),
    );

    // Create rankings for cities that don't have one yet
    const newRankings = citiesData
      .filter((city) => !existingInventoryIds.has(city.inventoryId))
      .map((city) => ({
        locode: city.locode,
        inventoryId: city.inventoryId,
        langs: languages,
        type: actionType,
        jobId: null, // Null means not yet processed, will be updated when batch is sent to AI API
        status: HighImpactActionRankingStatus.TO_DO, // Not sent to AI API yet
        isBulk: true, // Bulk prioritization
      }));

    if (newRankings.length > 0) {
      await db.models.HighImpactActionRanking.bulkCreate(newRankings);
      logger.info(
        { count: newRankings.length },
        "Created new ranking records with TO_DO status",
      );
    } else {
      logger.info("All ranking records already exist");
    }
  }

  /**
   * Process a single batch of cities (up to 100)
   */
  private static async processBatch(
    batchCities: CityInventoryData[],
    actionType: ACTION_TYPES,
    languages: LANGUAGES[],
    batchNumber: number,
  ): Promise<{ taskId: string }> {
    logger.info(
      { batchNumber, cityCount: batchCities.length },
      "Processing batch",
    );

    // Gather context data for all cities in the batch
    const citiesContextData = [];
    const failedCities: string[] = [];

    for (const city of batchCities) {
      try {
        const contextData =
          await hiapServiceWrapper.getCityContextAndEmissionsData(
            city.inventoryId,
          );
        citiesContextData.push(contextData);
      } catch (error: any) {
        logger.error(
          {
            cityId: city.cityId,
            inventoryId: city.inventoryId,
            locode: city.locode,
            error: error.message,
          },
          "Failed to get context data for city",
        );
        failedCities.push(city.inventoryId);
      }
    }

    if (citiesContextData.length === 0) {
      throw new Error("Failed to get context data for all cities in batch");
    }

    // Get successful inventory IDs (cities that passed context data gathering)
    const successfulInventoryIds = batchCities
      .filter((c) => !failedCities.includes(c.inventoryId))
      .map((c) => c.inventoryId);

    // Update status from TO_DO to PENDING before sending to AI API
    await db.models.HighImpactActionRanking.update(
      { status: HighImpactActionRankingStatus.PENDING },
      {
        where: {
          inventoryId: { [Op.in]: successfulInventoryIds },
          type: actionType,
          status: HighImpactActionRankingStatus.TO_DO,
        },
      },
    );

    logger.info(
      {
        batchNumber,
        cityCount: successfulInventoryIds.length,
      },
      "Updated rankings to PENDING, sending to AI API",
    );

    // Start HIAP bulk prioritization
    const { taskId } = await HiapApiService.startBulkPrioritization(
      citiesContextData,
      actionType,
      languages,
    );

    logger.info(
      {
        batchNumber,
        taskId,
        cityCount: citiesContextData.length,
      },
      "Started HIAP bulk prioritization for batch",
    );

    // Update ranking records with taskId (only for successful cities)
    await db.models.HighImpactActionRanking.update(
      { jobId: taskId },
      {
        where: {
          inventoryId: { [Op.in]: successfulInventoryIds },
          type: actionType,
          status: HighImpactActionRankingStatus.PENDING,
          [Op.or]: [{ jobId: { [Op.is]: null } }, { jobId: "" }],
        },
      },
    );

    // Mark failed cities as failed
    if (failedCities.length > 0) {
      await db.models.HighImpactActionRanking.update(
        {
          status: HighImpactActionRankingStatus.FAILURE,
          jobId: taskId, // Use same taskId for tracking
          errorMessage: "Failed to fetch city context data",
        },
        {
          where: {
            inventoryId: { [Op.in]: failedCities },
            type: actionType,
          },
        },
      );
    }

    // Return immediately - cron job will check status and process results
    logger.info(
      {
        taskId,
        cityCount: citiesContextData.length,
        failedCount: failedCities.length,
      },
      "Batch started, waiting for cron job to check completion",
    );

    return { taskId };
  }

  /**
   * Mark all rankings in a batch as failed
   */
  private static async markBatchRankingsAsFailed(
    batchCities: CityInventoryData[],
    actionType: ACTION_TYPES,
    errorMessage: string,
  ): Promise<void> {
    await db.models.HighImpactActionRanking.update(
      {
        status: HighImpactActionRankingStatus.FAILURE,
        errorMessage: errorMessage,
      },
      {
        where: {
          inventoryId: { [Op.in]: batchCities.map((c) => c.inventoryId) },
          type: actionType,
        },
      },
    );

    logger.info(
      {
        cityCount: batchCities.length,
        actionType,
        error: errorMessage,
      },
      "Marked batch rankings as failed",
    );
  }
}
