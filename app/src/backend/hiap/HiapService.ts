import { LANGUAGES, ACTION_TYPES } from "@/util/types";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "@/services/logger";
import { db } from "@/models";
import PopulationService from "../PopulationService";
import {
  getTotalEmissionsBySector,
  EmissionsBySector,
} from "../ResultsService";
import { HighImpactActionRanking } from "@/models/HighImpactActionRanking";
import { HighImpactActionRanked } from "@/models/HighImpactActionRanked";
import { HighImpactActionRankingStatus } from "@/util/types";
import { hiapApiWrapper } from "./HiapApiService";
import { InventoryService } from "../InventoryService";
import GlobalAPIService from "../GlobalAPIService";
import {
  PrioritizerResponse,
  PrioritizerCityData,
  PrioritizerRankedAction,
  MergedRankedAction,
} from "./types";
import uniqBy from "lodash/uniqBy";
import EmailService from "../EmailService";
import { User } from "@/models/User";
import { AppSession } from "@/lib/auth";
import { Op } from "sequelize";
import VersionHistoryService from "../VersionHistoryService";
import { getTranslationFromDictionary } from "@/util/helpers";
import {
  syncHIAPRanking,
  syncHIAPSelections,
} from "./HiapNativeInputCatalogService";

const HIAP_API_URL = process.env.HIAP_API_URL || "http://hiap-service";
logger.info(`Using HIAP API at ${HIAP_API_URL}`);

const getClient = (() => {
  let client: S3Client | null = null;

  return () => {
    if (client) return client;

    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const bucketId = process.env.AWS_S3_BUCKET_ID;

    if (!region || !accessKeyId || !secretAccessKey || !bucketId) {
      logger.error(
        {
          region: !!region,
          accessKeyId: !!accessKeyId,
          secretAccessKey: !!secretAccessKey,
          bucketId: !!bucketId,
        },
        "Missing AWS credentials",
      );
      throw new Error("Missing AWS credentials");
    }

    client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: false,
    });

    return client;
  };
})();

export const findExistingRanking = async (
  inventoryId: string,
  locode: string,
  langs: LANGUAGES[],
  type: ACTION_TYPES,
) => {
  const ranking = await db.models.HighImpactActionRanking.findOne({
    where: { locode, inventoryId, langs, type },
    include: [
      {
        model: db.models.HighImpactActionRanked,
        as: "highImpactActionRanked",
      },
    ],
  });
  return ranking;
};

export const startActionRankingJob = async (
  inventoryId: string,
  locode: string,
  langs: LANGUAGES[],
  type: ACTION_TYPES,
  user?: User,
) => {
  // Check if a ranking is already in progress for this inventory/locode
  const existingRanking = await db.models.HighImpactActionRanking.findOne({
    where: { inventoryId, locode, type },
    order: [["created", "DESC"]],
  });

  // If there's already a ranking in progress, return it instead of starting a new one
  if (
    existingRanking &&
    existingRanking.status === HighImpactActionRankingStatus.PENDING &&
    existingRanking.jobId
  ) {
    logger.info(
      {
        rankingId: existingRanking.id,
        inventoryId,
        locode,
      },
      "Ranking already in progress, returning existing ranking",
    );
    return existingRanking;
  }

  const contextData =
    await hiapServiceWrapper.getCityContextAndEmissionsData(inventoryId);
  logger.info({ contextData }, "City context and emissions data fetched");
  if (!contextData) throw new Error("No city context/emissions data found");

  const { taskId } = await hiapApiWrapper.startPrioritization(
    contextData,
    type,
    langs,
  );
  logger.info({ taskId }, "Task ID received from HIAP API");
  if (!taskId) throw new Error("No taskId returned from HIAP API");

  const ranking = await db.models.HighImpactActionRanking.create({
    locode,
    inventoryId,
    langs: langs,
    type,
    jobId: taskId,
    status: HighImpactActionRankingStatus.PENDING,
    isBulk: false, // Single city prioritization
    userId: user?.userId,
  });
  logger.info(
    `Ranking created in DB with ID: ${ranking.id}, langs: ${langs.join(", ")}`,
  );

  // Do not await here, it will make the request time out. Poll job in the background.
  // Use the first language for the initial check
  if (langs.length > 0) {
    checkActionRankingJob(ranking, langs[0], type, user);
  } else {
    logger.error("No languages provided for action ranking job");
  }
  return ranking;
};

export const startBothActionRankingJobs = async (
  inventoryId: string,
  locode: string,
  langs: LANGUAGES[],
  type: ACTION_TYPES,
  user?: User,
) => {
  const oppositeType =
    type === ACTION_TYPES.Mitigation
      ? ACTION_TYPES.Adaptation
      : ACTION_TYPES.Mitigation;

  // start the opposite type job in the background
  startActionRankingJob(inventoryId, locode, langs, oppositeType, user).catch((error) => {
    logger.error(
      { error, inventoryId, locode, type: oppositeType },
      "Background action ranking job failed"
    );
  });
  // then start the current type job and return the result
  return await startActionRankingJob(inventoryId, locode, langs, type, user);
};

/**
 * Start bulk prioritization job for multiple cities
 * All cities will share the same jobId from HIAP
 */
export const startBulkActionRankingJob = async (
  citiesInventoriesData: Array<{
    inventoryId: string;
    locode: string;
    cityId: string;
  }>,
  langs: LANGUAGES[],
  type: ACTION_TYPES,
  userId: string,
) => {
  logger.info(
    { cityCount: citiesInventoriesData.length, type, langs },
    "Starting bulk action ranking job",
  );

  // Gather context data for all cities
  const citiesData: PrioritizerCityData[] = [];
  const failed: Array<{ inventoryId: string; error: string }> = [];

  for (const { inventoryId, locode } of citiesInventoriesData) {
    try {
      const contextData =
        await hiapServiceWrapper.getCityContextAndEmissionsData(inventoryId);
      citiesData.push(contextData);
    } catch (error: unknown) {
      logger.error(
        { inventoryId, error },
        `Failed to get context data for city ${locode}`,
      );
      failed.push({
        inventoryId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (citiesData.length === 0) {
    throw new Error("Failed to get context data for all cities");
  }

  // Start bulk prioritization (single HIAP API call for all cities)
  const { taskId } = await hiapApiWrapper.startBulkPrioritization(
    citiesData,
    type,
    langs,
  );

  logger.info(
    { taskId, cityCount: citiesData.length },
    "Bulk prioritization started, creating ranking records",
  );

  // Create ranking records for all cities with the SAME jobId
  const rankings = await Promise.all(
    citiesInventoriesData.map(async ({ inventoryId, locode }) => {
      // Skip if context data failed for this city
      if (failed.some((f) => f.inventoryId === inventoryId)) {
        return null;
      }

      return await db.models.HighImpactActionRanking.create({
        locode,
        inventoryId,
        langs: Object.values(LANGUAGES),
        type,
        jobId: taskId, // SAME jobId for all cities in this bulk batch
        status: HighImpactActionRankingStatus.PENDING,
        isBulk: true, // Old bulk prioritization (kept for backward compatibility)
        userId,
      });
    }),
  );

  const successfulRankings = rankings.filter((r) => r !== null);

  logger.info(
    {
      taskId,
      totalCities: citiesInventoriesData.length,
      successful: successfulRankings.length,
      failed: failed.length,
    },
    "Bulk ranking records created",
  );

  return {
    taskId,
    rankings: successfulRankings,
    failed,
  };
};

/**
 * Check single prioritization job status ONCE and save results if completed
 * Called by cron job for single-city rankings
 * Returns true if job is complete (success or failure), false if still pending
 */
export const checkSingleActionRankingJob = async (
  jobId: string,
  lang: LANGUAGES,
  type: ACTION_TYPES,
): Promise<boolean> => {
  logger.info({ jobId, type }, "Checking single action ranking job status");

  try {
    // Check status ONCE (no polling)
    const statusData = await hiapApiWrapper.checkPrioritizationProgress(jobId);

    logger.info(
      { jobId, status: statusData.status },
      "Checked single job status",
    );

    // Handle different status outcomes
    if (statusData.status === "pending") {
      return false;
    }

    if (statusData.status === "failed") {
      await db.models.HighImpactActionRanking.update(
        {
          status: HighImpactActionRankingStatus.FAILURE,
          errorMessage:
            statusData.error || "HIAP single prioritization job failed",
        },
        { where: { jobId } },
      );
      logger.error(
        { jobId, error: statusData.error },
        "Single prioritization job failed",
      );
      return true;
    }

    // Status is "completed" - fetch result
    let singleResponse;
    try {
      singleResponse = await hiapApiWrapper.getPrioritizationResult(jobId);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("409")) {
        logger.warn(
          { jobId, error: error.message },
          "Result not ready yet (409 Conflict), will retry on next cron run",
        );
        return false;
      }
      throw error;
    }

    // Wrap single response in bulk format for unified processing
    const bulkResponse = {
      prioritizerResponseList: [singleResponse],
    };

    // Process using the same logic as bulk jobs
    return await processBulkJobResults(jobId, bulkResponse);
  } catch (err) {
    logger.error({ err, jobId }, "Error in checkSingleActionRankingJob");
    throw err;
  }
};

/**
 * Process bulk job results (shared by both bulk and single jobs)
 * Saves ranked actions for all cities in the job
 * Returns true when complete
 */
async function processBulkJobResults(
  jobId: string,
  bulkResponse: { prioritizerResponseList: PrioritizerResponse[] },
): Promise<boolean> {
  // Get all rankings that share this jobId
  const rankings = await db.models.HighImpactActionRanking.findAll({
    where: { jobId },
  });

  logger.info(
    {
      jobId,
      rankingCount: rankings.length,
      responseCount: bulkResponse.prioritizerResponseList.length,
    },
    "Found rankings and responses for bulk job",
  );

  // Log summary of what HIAP returned for each city
  const responsesSummary = bulkResponse.prioritizerResponseList.map(
    (response) => {
      const mitActionIds = response.rankedActionsMitigation
        .slice(0, 5)
        .map((a: PrioritizerRankedAction) => `${a.actionId}:${a.rank}`)
        .join(",");
      const adpActionIds = response.rankedActionsAdaptation
        .slice(0, 5)
        .map((a: PrioritizerRankedAction) => `${a.actionId}:${a.rank}`)
        .join(",");
      return {
        locode: response.metadata.locode,
        mitCount: response.rankedActionsMitigation.length,
        adpCount: response.rankedActionsAdaptation.length,
        topMitActions: mitActionIds || "none",
        topAdpActions: adpActionIds || "none",
      };
    },
  );
  logger.info(
    { jobId, responses: responsesSummary },
    "🔍 HIAP API Response Summary (first 5 actions per city)",
  );

  // Create a map of locode -> PrioritizerResponse for easy lookup
  const responseByLocode = new Map(
    bulkResponse.prioritizerResponseList.map((response) => [
      response.metadata.locode,
      response,
    ]),
  );

  // Save ranked actions for each city's ranking
  for (const ranking of rankings) {
    try {
      // Skip rankings that already failed during context data fetch
      if (ranking.status === HighImpactActionRankingStatus.FAILURE) {
        logger.info(
          { rankingId: ranking.id, locode: ranking.locode },
          "Skipping ranking that already failed during context fetch",
        );
        continue;
      }

      // Find the response for this city's locode
      const cityResponse = responseByLocode.get(ranking.locode);

      if (!cityResponse) {
        logger.error(
          { rankingId: ranking.id, locode: ranking.locode },
          "No response found for city in bulk results",
        );
        await ranking.update({
          status: HighImpactActionRankingStatus.FAILURE,
          errorMessage: `No prioritization result found for locode: ${ranking.locode}`,
        });
        continue;
      }

      // Log what we got from the response map
      logger.info(
        {
          rankingId: ranking.id,
          locode: ranking.locode,
          foundInMap: !!cityResponse,
          mitActionsCount: cityResponse.rankedActionsMitigation.length,
          adpActionsCount: cityResponse.rankedActionsAdaptation.length,
        },
        "🔍 Retrieved city response from map",
      );

      const rankedActions = [
        ...cityResponse.rankedActionsMitigation.map(
          (a: PrioritizerRankedAction) => ({
            ...a,
            type: ACTION_TYPES.Mitigation,
          }),
        ),
        ...cityResponse.rankedActionsAdaptation.map(
          (a: PrioritizerRankedAction) => ({
            ...a,
            type: ACTION_TYPES.Adaptation,
          }),
        ),
      ];

      // Save ranked actions for ALL languages in ranking.langs
      const languagesToProcess = ranking.langs as LANGUAGES[];
      for (const language of languagesToProcess) {
        const mergedRanked = await fetchAndMergeRankedActions(
          language,
          rankedActions,
        );
        await saveRankedActionsForLanguage(ranking, mergedRanked, language);
      }

      // Update ranking status to success
      await ranking.update({ status: HighImpactActionRankingStatus.SUCCESS });
      await syncHIAPRanking(ranking);

      logger.info(
        {
          rankingId: ranking.id,
          locode: ranking.locode,
          languagesProcessed: languagesToProcess,
        },
        "Saved ranked actions for city in all languages",
      );
    } catch (error: unknown) {
      logger.error(
        { rankingId: ranking.id, locode: ranking.locode, error },
        "Failed to save ranked actions for city",
      );
      await ranking.update({
        status: HighImpactActionRankingStatus.FAILURE,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Failed to save ranked actions",
      });
    }
  }

  logger.info({ jobId }, "Bulk action ranking job completed successfully");

  return true; // Job is complete (success)
}

/**
 * Check bulk prioritization job status ONCE and save results if completed
 * Called by cron job for multi-city rankings
 * Returns true if job is complete (success or failure), false if still pending
 */
export const checkBulkActionRankingJob = async (
  jobId: string,
  lang: LANGUAGES,
  type: ACTION_TYPES,
): Promise<boolean> => {
  logger.info({ jobId, type }, "Checking bulk action ranking job status");

  try {
    // Check status ONCE (no polling)
    const statusData =
      await hiapApiWrapper.checkBulkPrioritizationProgress(jobId);

    logger.info(
      { jobId, status: statusData.status },
      "Checked bulk job status",
    );

    // Handle different status outcomes
    if (statusData.status === "pending") {
      // Still processing - cron will check again next minute
      return false;
    }

    if (statusData.status === "failed") {
      // Update all rankings with this jobId to failed
      await db.models.HighImpactActionRanking.update(
        {
          status: HighImpactActionRankingStatus.FAILURE,
          errorMessage:
            statusData.error || "HIAP bulk prioritization job failed",
        },
        { where: { jobId } },
      );
      logger.error(
        { jobId, error: statusData.error },
        "Bulk prioritization job failed",
      );
      return true; // Job is complete (failed)
    }

    // Status is "completed" - fetch result
    let bulkResponse;
    try {
      bulkResponse = await hiapApiWrapper.getBulkPrioritizationResult(jobId);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("409")) {
        logger.warn(
          { jobId, error: error.message },
          "Result not ready yet (409 Conflict), will retry on next cron run",
        );
        return false;
      }
      throw error;
    }

    // Process using shared logic
    return await processBulkJobResults(jobId, bulkResponse);
  } catch (err) {
    logger.error({ err, jobId }, "Error in checkBulkActionRankingJob");
    throw err;
  }
};

// Helper: Extract string from multilingual field (object or string)
function extractLocalizedString(
  field: string | Record<string, string> | null | undefined,
  lang: LANGUAGES,
): string | undefined {
  return getTranslationFromDictionary(field ?? undefined, lang);
}

/** Ensure ranked action text fields are strings for the requested language. */
export function normalizeRankedActionForLang(
  action: HighImpactActionRanked,
  lang: LANGUAGES,
): Record<string, unknown> {
  const plain = typeof action.toJSON === "function" ? action.toJSON() : action;
  return {
    ...plain,
    name: getTranslationFromDictionary(plain.name, lang) ?? plain.name ?? "",
    description:
      getTranslationFromDictionary(plain.description, lang) ??
      plain.description ??
      "",
    equityAndInclusionConsiderations:
      getTranslationFromDictionary(
        plain.equityAndInclusionConsiderations,
        lang,
      ) ??
      plain.equityAndInclusionConsiderations ??
      "",
  };
}

async function fetchAndMergeRankedActions(
  lang: LANGUAGES,
  rankedActions: {
    actionId: string;
    rank: number;
    explanation: { explanations?: Record<string, string> };
    isSelected?: boolean;
    type: ACTION_TYPES;
  }[],
): Promise<MergedRankedAction[]> {
  const allActions = await GlobalAPIService.fetchAllClimateActions(lang);

  return rankedActions
    .map((rankedAction): MergedRankedAction | null => {
      const details = allActions.find(
        (a) => a.ActionID === rankedAction.actionId,
      );
      if (!details) {
        logger.error(
          `No action details found for ActionID: ${rankedAction.actionId}`,
        );
        return null;
      }

      return {
        ...rankedAction,
        explanation: rankedAction.explanation,
        name: extractLocalizedString(details.ActionName, lang),
        hazard: details.Hazard,
        sector: details.Sector,
        subsector: details.Subsector,
        primaryPurpose: details.PrimaryPurpose,
        description: extractLocalizedString(details.Description, lang),
        cobenefits: details.CoBenefits,
        equityAndInclusionConsiderations: extractLocalizedString(
          details.EquityAndInclusionConsiderations,
          lang,
        ),
        GHGReductionPotential: details.GHGReductionPotential,
        adaptationEffectiveness: details.AdaptationEffectiveness,
        costInvestmentNeeded: details.CostInvestmentNeeded,
        timelineForImplementation: details.TimelineForImplementation,
        dependencies: details.Dependencies,
        keyPerformanceIndicators: details.KeyPerformanceIndicators,
        powersAndMandates: details.PowersAndMandates,
        adaptationEffectivenessPerHazard:
          details.AdaptationEffectivenessPerHazard,
        biome: details.biome,
      };
    })
    .filter((r): r is MergedRankedAction => r !== null);
}

// Helper: Check if actions already exist for a language and return them if they do
async function checkExistingActions(
  rankingId: string,
  lang: LANGUAGES,
): Promise<HighImpactActionRanked[] | null> {
  const existingActions = await db.models.HighImpactActionRanked.findAll({
    where: { hiaRankingId: rankingId, lang },
  });

  if (existingActions.length > 0) {
    logger.info(
      `[saveRankedActionsForLanguage] Actions for lang ${lang} already exist, returning ${existingActions.length} actions`,
    );
    return existingActions;
  }
  return null;
}

// Helper: Normalize field to array (handles strings and nulls)
function normalizeToArray(
  value: string | string[] | null | undefined,
): string[] | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    // If it's a string, split by common separators or return as single-item array
    if (value.trim() === "") {
      return undefined;
    }
    // Check if it's a comma-separated or newline-separated list
    if (value.includes("\n")) {
      return value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (value.includes(",")) {
      return value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    // Otherwise, return as single item array
    return [value];
  }
  return undefined;
}

// Helper: Create a single ranked action record
async function createRankedActionRecord(
  rankingId: string,
  lang: LANGUAGES,
  rankedAction: MergedRankedAction | null,
  inventoryId: string,
  userId: string | undefined,
): Promise<boolean> {
  if (!rankedAction) return false;

  try {
    const entry = await db.models.HighImpactActionRanked.create(
      {
        hiaRankingId: rankingId,
        lang: lang,
        actionId: rankedAction.actionId,
        rank: rankedAction.rank,
        type: rankedAction.type,
        explanation: rankedAction.explanation,
        name: rankedAction.name ?? "",
        hazards: normalizeToArray(rankedAction.hazard),
        sectors: normalizeToArray(rankedAction.sector),
        subsectors: normalizeToArray(rankedAction.subsector),
        primaryPurposes: normalizeToArray(rankedAction.primaryPurpose),
        description: rankedAction.description,
        cobenefits: rankedAction.cobenefits as unknown as Record<
          string,
          object
        >,
        equityAndInclusionConsiderations:
          rankedAction.equityAndInclusionConsiderations,
        GHGReductionPotential: rankedAction.GHGReductionPotential as unknown as Record<
          string,
          object
        >,
        adaptationEffectiveness: rankedAction.adaptationEffectiveness ?? undefined,
        costInvestmentNeeded: rankedAction.costInvestmentNeeded ?? undefined,
        timelineForImplementation:
          rankedAction.timelineForImplementation ?? undefined,
        dependencies: normalizeToArray(rankedAction.dependencies),
        keyPerformanceIndicators: normalizeToArray(
          rankedAction.keyPerformanceIndicators,
        ),
        powersAndMandates: normalizeToArray(rankedAction.powersAndMandates),
        adaptationEffectivenessPerHazard:
          rankedAction.adaptationEffectivenessPerHazard as unknown as Record<
            string,
            object
          >,
        biome: rankedAction.biome ?? undefined,
        // Keep selection in sync when copying ranked rows into a new language
        isSelected: Boolean(rankedAction.isSelected),
      },
      { returning: true },
    );
    await VersionHistoryService.createVersion(
      inventoryId,
      "HighImpactActionRanked",
      entry.id,
      userId,
      entry,
      false,
      undefined,
      "hiap",
    );

    return true;
  } catch (err) {
    logger.error({ rankedAction, err }, "Failed to save ranked action");
    throw err;
  }
}

// Helper: Save ranked actions for a language and return the actions
async function saveRankedActionsForLanguage(
  ranking: HighImpactActionRanking,
  rankedActions: {
    actionId: string;
    rank: number;
    explanation: { explanations?: Record<string, string> };
    type: ACTION_TYPES;
    isSelected?: boolean;
  }[],
  lang: LANGUAGES,
): Promise<Record<string, unknown>[]> {
  // Check if actions already exist for this language
  const existingActions = await checkExistingActions(ranking.id, lang);
  if (existingActions) {
    return existingActions as unknown as Record<string, unknown>[];
  }

  // Note: No race condition check needed here because we prevent multiple
  // ranking requests at the source in startActionRankingJob

  // Fetch and merge action details in the requested language
  const mergedRanked = await fetchAndMergeRankedActions(lang, rankedActions);

  // Save all ranked actions
  const results = await Promise.all(
    mergedRanked.map((action) =>
      createRankedActionRecord(
        ranking.id,
        lang,
        action,
        ranking.inventoryId,
        ranking.userId,
      ),
    ),
  );

  const savedCount = results.filter(Boolean).length;

  // Log sample of what was saved
  const savedSample = mergedRanked.slice(0, 3).map((a) => ({
    actionId: a.actionId,
    rank: a.rank,
    name: a.name ? Array.from(a.name).slice(0, 30).join("") : undefined,
  }));
  logger.info(
    {
      rankingId: ranking.id,
      lang,
      savedCount,
      totalMerged: mergedRanked.length,
      savedSample,
    },
    `[saveRankedActionsForLanguage] Saved ranked actions to DB`,
  );

  // Return the newly created actions
  return getRankedActionsForLang(ranking, lang);
}

export const checkActionRankingJob = async (
  ranking: HighImpactActionRanking,
  lang: LANGUAGES,
  type: ACTION_TYPES,
  user?: User,
) => {
  const { jobId } = ranking;
  if (!jobId) throw new Error("Ranking is missing jobId");
  try {
    let jobStatus: HighImpactActionRankingStatus =
      ranking.status || HighImpactActionRankingStatus.PENDING;
    let pollCount = 0;
    const maxPolls = 60;
    const pollInterval = 10000;
    while (
      jobStatus === HighImpactActionRankingStatus.PENDING &&
      pollCount < maxPolls
    ) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      const statusData =
        await hiapApiWrapper.checkPrioritizationProgress(jobId);
      logger.info({ jobStatus }, "Polled job status");
      switch (statusData.status) {
        case "completed":
          jobStatus = HighImpactActionRankingStatus.SUCCESS;
          break;
        case "failed":
          jobStatus = HighImpactActionRankingStatus.FAILURE;
          await ranking.update({
            status: HighImpactActionRankingStatus.FAILURE,
            errorMessage: statusData.error || "HIAP prioritization job failed",
          });
          throw new Error("Prioritization job failed");
        default:
          jobStatus = HighImpactActionRankingStatus.PENDING;
          break;
      }
      pollCount++;
    }
    // Fetch result
    const actionRanking: PrioritizerResponse =
      await hiapApiWrapper.getPrioritizationResult(jobId);

    // Merge and save ranked actions with details for this language
    const rankedActions = [
      ...actionRanking.rankedActionsMitigation.map((a) => ({
        ...a,
        type: ACTION_TYPES.Mitigation,
      })),
      ...actionRanking.rankedActionsAdaptation.map((a) => ({
        ...a,
        type: ACTION_TYPES.Adaptation,
      })),
    ];
    const mergedRanked = await fetchAndMergeRankedActions(lang, rankedActions);
    await saveRankedActionsForLanguage(ranking, mergedRanked, lang);

    await ranking.update({ status: HighImpactActionRankingStatus.SUCCESS });
    await syncHIAPRanking(ranking);

    // Send email notification when job completes successfully
    if (user && mergedRanked.length > 0) {
      try {
        await sendRankedReadyEmail(user, type);
        logger.info(
          { userId: user.userId, actionType: type },
          "Sent prioritization ready email",
        );
      } catch (emailError) {
        logger.error(
          { error: emailError },
          "Failed to send prioritization ready email",
        );
        // Continue execution - email failure shouldn't break the job completion
      }
    }

    return ranking;
  } catch (err) {
    logger.error({ err }, "Error in runActionRankingJob");
  }
};

// Helper to get emissions for a sector by name
function getSectorEmissions(
  emissionsBySector: EmissionsBySector[],
  sectorName: string,
): number | null {
  const value = emissionsBySector.find(
    (s) => s.sector_name === sectorName,
  )?.co2eq;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

// Wrapper object for functions that need to be mocked in tests
export const hiapServiceWrapper = {
  getCityContextAndEmissionsData: async (
    inventoryId: string,
  ): Promise<PrioritizerCityData> => {
    return await getCityContextAndEmissionsDataImpl(inventoryId);
  },
};

async function getCityContextAndEmissionsDataImpl(
  inventoryId: string,
): Promise<PrioritizerCityData> {
  // Get inventory to access city information
  const inventory = await db.models.Inventory.findByPk(inventoryId, {
    include: [
      { model: db.models.City, as: "city" },
      { model: db.models.InventoryValue, as: "inventoryValues" },
    ],
  });
  if (!inventory) throw new Error("Inventory not found");
  const city = inventory.city;
  if (!city) throw new Error("City not found for inventory");

  const populationData = await PopulationService.getPopulationDataForCityYear(
    city.cityId,
    inventory.year!,
  );

  // Ensure population is integer or null (HIAP requires integer ≥ 0 or null)
  const populationSize =
    populationData.population && !isNaN(Number(populationData.population))
      ? Math.round(Number(populationData.population))
      : null;

  const emissionsBySector = await getTotalEmissionsBySector([inventoryId]);

  // Log what we got from getTotalEmissionsBySector
  logger.info(
    {
      inventoryId,
      locode: city.locode,
      emissionsBySectorCount: emissionsBySector.length,
      sectorNames: emissionsBySector.map((s) => s.sector_name),
      sampleSector: emissionsBySector[0],
    },
    "🔍 Emissions data retrieved from getTotalEmissionsBySector",
  );

  // Get emissions for each sector (can be null)
  const rawEmissions = {
    stationaryEnergyEmissions: getSectorEmissions(
      emissionsBySector,
      "Stationary Energy",
    ),
    transportationEmissions: getSectorEmissions(
      emissionsBySector,
      "Transportation",
    ),
    wasteEmissions: getSectorEmissions(emissionsBySector, "Waste"),
    ippuEmissions: getSectorEmissions(
      emissionsBySector,
      "Industrial Processes and Product Uses (IPPU)",
    ),
    afoluEmissions: getSectorEmissions(
      emissionsBySector,
      "Agriculture, Forestry, and Other Land Use (AFOLU)",
    ),
  };

  // Transform emissions: convert to integers (HIAP requires strict integers)
  // null → 0, floats → rounded integers
  const cityEmissionsData = {
    stationaryEnergyEmissions: Math.round(
      rawEmissions.stationaryEnergyEmissions ?? 0,
    ),
    transportationEmissions: Math.round(
      rawEmissions.transportationEmissions ?? 0,
    ),
    wasteEmissions: Math.round(rawEmissions.wasteEmissions ?? 0),
    ippuEmissions: Math.round(rawEmissions.ippuEmissions ?? 0),
    afoluEmissions: Math.round(rawEmissions.afoluEmissions ?? 0),
  };

  // Format locode with space: "BRSAO" -> "BR SAO" (HIAP requires: ^[A-Za-z]{2}\s[A-Za-z]{3}$)
  const formattedLocode =
    city.locode!.length === 5
      ? `${city.locode!.substring(0, 2)} ${city.locode!.substring(2)}`
      : city.locode!;

  const cityData: PrioritizerCityData = {
    cityContextData: {
      locode: formattedLocode,
      populationSize,
    },
    cityEmissionsData,
  };

  logger.info(
    {
      inventoryId,
      originalLocode: city.locode,
      formattedLocode: formattedLocode,
      population: populationSize,
      cityEmissionsData,
      types: {
        locode: typeof formattedLocode,
        population: typeof populationSize,
        stationaryEnergy: typeof cityEmissionsData.stationaryEnergyEmissions,
        transportation: typeof cityEmissionsData.transportationEmissions,
        waste: typeof cityEmissionsData.wasteEmissions,
        ippu: typeof cityEmissionsData.ippuEmissions,
        afolu: typeof cityEmissionsData.afoluEmissions,
      },
    },
    "🔍 Final city data prepared for HIAP (with type validation)",
  );

  return cityData;
}

// Helper: Find a ranking for the requested language and action type, or any ranking for the inventory/locode/type
async function findOrSelectRanking(
  inventoryId: string,
  locode: string,
  lang: LANGUAGES,
  type: ACTION_TYPES,
) {
  // First try to find a ranking that includes the requested language
  let ranking = await db.models.HighImpactActionRanking.findOne({
    where: {
      inventoryId,
      locode,
      type,
      langs: { [Op.contains]: [lang] }, // Check if the langs array contains this language
    },
    include: [
      {
        model: db.models.HighImpactActionRanked,
        as: "highImpactActionRanked",
      },
    ],
    order: [["created", "DESC"]],
  });

  // If no ranking found with the requested language, try to find ANY ranking for this inventory/type
  // We can then copy actions to the requested language
  if (!ranking) {
    logger.info(
      { inventoryId, locode, type, requestedLang: lang },
      "No ranking found with requested language, searching for any ranking for this inventory/type",
    );
    ranking = await db.models.HighImpactActionRanking.findOne({
      where: {
        inventoryId,
        locode,
        type,
      },
      include: [
        {
          model: db.models.HighImpactActionRanked,
          as: "highImpactActionRanked",
        },
      ],
      order: [["created", "DESC"]],
    });

    if (ranking) {
      logger.info(
        {
          rankingId: ranking.id,
          rankingLangs: ranking.langs,
          requestedLang: lang,
        },
        "Found ranking with different languages, will copy to requested language",
      );
    }
  }

  return ranking;
}

// Helper: Get ranked actions for a ranking and language
async function getRankedActionsForLang(
  ranking: HighImpactActionRanking,
  lang: LANGUAGES,
  type?: ACTION_TYPES,
): Promise<Record<string, unknown>[]> {
  // Repair any pre-existing per-language selection drift before reading
  await syncRankedActionSelectionsAcrossLanguages(ranking.id);

  const whereClause: {
    hiaRankingId: string;
    lang: LANGUAGES;
    type?: ACTION_TYPES;
  } = { hiaRankingId: ranking.id, lang };

  // Add type filter only if type is provided
  if (type) {
    whereClause.type = type;
  }

  const actions = await db.models.HighImpactActionRanked.findAll({
    where: whereClause,
    order: [["rank", "ASC"]],
  });

  return actions.map((action) => normalizeRankedActionForLang(action, lang));
}

// Helper: Copy actions from any existing language to the requested language
export async function copyRankedActionsToLang(
  ranking: HighImpactActionRanking,
  lang: LANGUAGES,
) {
  const allLangRanked = await db.models.HighImpactActionRanked.findAll({
    where: { hiaRankingId: ranking.id },
  });

  if (
    allLangRanked.length === 0 &&
    ranking.status !== HighImpactActionRankingStatus.PENDING
  ) {
    throw new Error("No existing ranked actions found for this ranking");
  }

  // Use lodash.uniqBy to get unique actions by actionId, then get the first occurrence of each
  const uniqueActions = uniqBy(allLangRanked, "actionId").sort(
    (a, b) => a.rank - b.rank,
  );

  // Aggregate available languages across all actions
  const availableLanguagesSet = new Set<string>();
  for (const action of uniqueActions) {
    if (action.explanation && typeof action.explanation === "object") {
      Object.keys(action.explanation).forEach((lang) =>
        availableLanguagesSet.add(lang),
      );
    }
  }
  const availableLanguages = Array.from(availableLanguagesSet).sort();
  const hasRequestedLang = availableLanguages.includes(lang);

  logger.info(
    {
      requestedLang: lang,
      availableLanguages,
      rankingLangs: ranking.langs,
      hasRequestedLang,
      actionCount: uniqueActions.length,
    },
    `Copying ${uniqueActions.length} unique actions to language ${lang}`,
  );

  if (!hasRequestedLang) {
    logger.warn(
      {
        requestedLang: lang,
        availableLanguages,
        rankingId: ranking.id,
      },
      `⚠️  Requested language ${lang} not found in existing explanations. ` +
        `Explanations will only contain: ${availableLanguages.join(", ")}. ` +
        `Frontend should fall back to an available language.`,
    );
  }

  // Propagate selection flags: an action selected in any language stays selected in the new one
  const selectedActionIds = new Set(
    allLangRanked
      .filter((action) => action.isSelected)
      .map((action) => action.actionId),
  );

  const rankedActions = uniqueActions.map((r) => ({
    actionId: r.actionId,
    rank: r.rank,
    explanation: r.explanation, // Pass through explanation object with available languages
    type: r.type as ACTION_TYPES,
    isSelected: selectedActionIds.has(r.actionId),
  }));

  // Fetch and merge action details in the requested language
  const mergedRanked = await fetchAndMergeRankedActions(lang, rankedActions);
  const savedActions = await saveRankedActionsForLanguage(
    ranking,
    mergedRanked,
    lang,
  );

  // Update the ranking's langs array to include the new language
  const currentLangs = ranking.langs as string[];
  if (!currentLangs.includes(lang)) {
    const updatedLangs = [...currentLangs, lang];
    await ranking.update({ langs: updatedLangs });
    logger.info(
      {
        rankingId: ranking.id,
        previousLangs: currentLangs,
        updatedLangs,
      },
      "Updated ranking langs array with new language",
    );
  }

  return savedActions;
}

// Helper: Send email to user that the ranking is ready
async function sendRankedReadyEmail(user: User, actionType: ACTION_TYPES) {
  await EmailService.sendHiapRankingReadyEmail({ actionType, user });
}

// Main orchestrator
export const fetchRanking = async (
  inventoryId: string,
  type: ACTION_TYPES,
  lang: LANGUAGES,
  session?: AppSession,
  ignoreExisting: boolean = false,
) => {
  try {
    const user = await db.models.User.findByPk(session?.user.id);
    const locode = await InventoryService.getLocode(inventoryId);
    const ranking = await findOrSelectRanking(inventoryId, locode, lang, type);
    if (ranking) {
      // Handle reprioritization - reset status and restart job
      if (
        ignoreExisting &&
        ranking.status === HighImpactActionRankingStatus.SUCCESS
      ) {
        logger.info(
          "Reprioritization requested - resetting ranking status to PENDING",
        );

        // Reset ranking status to PENDING (keep existing data)
        await ranking.update({
          status: HighImpactActionRankingStatus.PENDING,
          jobId: undefined, // Clear old job ID
        });

        // Start new prioritization job
        const contextData =
          await hiapServiceWrapper.getCityContextAndEmissionsData(inventoryId);
        const { taskId } = await hiapApiWrapper.startPrioritization(
          contextData,
          type,
          (ranking.langs as LANGUAGES[]) || [lang], // Use existing langs or wrap single lang
        );

        // Update ranking with new job ID
        await ranking.update({ jobId: taskId });

        // Start background job
        checkActionRankingJob(ranking, lang, type, user || undefined);

        return { ...ranking.toJSON(), rankedActions: [] };
      }

      if (!ignoreExisting) {
        // Return if already have ranked actions for this language
        const existingRanked = await getRankedActionsForLang(
          ranking,
          lang,
          type,
        );
        if (existingRanked.length > 0) {
          return { ...ranking.toJSON(), rankedActions: existingRanked };
        }
      }

      // If ranking is pending, trigger job in background and return empty actions
      if (ranking.status === HighImpactActionRankingStatus.PENDING) {
        logger.info("Ranking is pending, triggering background job");
        checkActionRankingJob(ranking, lang, type, user || undefined);
        return { ...ranking.toJSON(), rankedActions: [] };
      } else if (ranking.status === HighImpactActionRankingStatus.SUCCESS) {
        // Ranking exists with SUCCESS status but doesn't have records for this language yet
        logger.info(
          {
            rankingId: ranking.id,
            requestedLang: lang,
            rankingLangs: ranking.langs,
            locode: ranking.locode,
          },
          "Ranking is SUCCESS, copying actions to requested language",
        );
        const newRanked = await copyRankedActionsToLang(ranking, lang);

        logger.info(
          {
            copiedCount: newRanked.length,
            lang,
            sampleAction: newRanked[0]
              ? {
                  actionId: newRanked[0].actionId,
                  rank: newRanked[0].rank,
                  hasName: !!newRanked[0].name,
                  hasExplanation: !!newRanked[0].explanation,
                  explanationKeys: newRanked[0].explanation
                    ? Object.keys(newRanked[0].explanation)
                    : [],
                }
              : null,
          },
          `✅ Copied ${newRanked.length} ranked actions for language ${lang}`,
        );
        return { ...ranking.toJSON(), rankedActions: newRanked };
      } else if (ranking.status === HighImpactActionRankingStatus.FAILURE) {
        logger.info("Ranking is failure, starting new job");
        // start a job for the opposite type
        await startBothActionRankingJobs(
          inventoryId,
          locode,
          [lang],
          type,
          user || undefined,
        );
      }
      logger.info("No ranking found, starting new job");
      return await startBothActionRankingJobs(
        inventoryId,
        locode,
        [lang],
        type,
        user || undefined,
      );
    } else {
      logger.info("No ranking found at all, starting new job");
      return await startBothActionRankingJobs(
        inventoryId,
        locode,
        [lang],
        type,
        user || undefined,
      );
    }
  } catch (err) {
    logger.error({ err: err }, "Error fetching prioritized climate actions:");
    throw err;
  }
};

// ============================================================================
// HIAP Action Selections Migration Functions
// We should delete these after the migration is complete
// ============================================================================

function getSelectedActionsFileName(locode: string, type: ACTION_TYPES) {
  return `data/selected/${type}/${locode}.json`;
}

const streamToString = async (stream: NodeJS.ReadableStream) => {
  // AWS S3 returns a stream-like object with 'on' method in Node.js backend
  const chunks: Uint8Array[] = [];

  return new Promise<string>((resolve, reject) => {
    stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => {
      const buffer = Buffer.concat(chunks);
      resolve(buffer.toString("utf-8"));
    });
  });
};

export const readSelectedActionsFile = async (
  locode: string,
  type: ACTION_TYPES,
) => {
  try {
    const selectedActionsKey = getSelectedActionsFileName(locode, type);
    const client = getClient();

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_ID,
      Key: selectedActionsKey,
      // Add cache-busting to force fresh read
      IfModifiedSince: new Date(0), // Always get fresh data
    });
    const response = await client.send(command);
    const body = response.Body;
    if (!body) return [];
    // Always a Node.js Readable in this backend runtime (see streamToString).
    const data = await streamToString(body as NodeJS.ReadableStream);
    try {
      return JSON.parse(data); // This will be an array of action IDs
    } catch {
      return [];
    }
  } catch (err) {
    logger.error(
      `HIAP Migrate: Error reading selected actions file for ${locode}, ${type}: ${err}`,
    );
    // this will fail if the file doesn't exist,
    // ignore it
    return [];
  }
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Sync ranked action selection across all language rows for a ranking.
 * Selection is keyed by stable actionId, not per-language row UUID.
 */
export async function syncRankedActionSelectionsAcrossLanguages(
  hiaRankingId: string,
): Promise<void> {
  const rows = await db.models.HighImpactActionRanked.findAll({
    where: { hiaRankingId },
    attributes: ["actionId", "isSelected"],
  });

  const selectedActionIds = [
    ...new Set(
      rows.filter((row) => row.isSelected).map((row) => row.actionId),
    ),
  ];

  if (selectedActionIds.length === 0) {
    await db.models.HighImpactActionRanked.update(
      { isSelected: false },
      { where: { hiaRankingId } },
    );
    return;
  }

  await db.models.HighImpactActionRanked.update(
    { isSelected: true },
    {
      where: {
        hiaRankingId,
        actionId: { [Op.in]: selectedActionIds },
      },
    },
  );
  await db.models.HighImpactActionRanked.update(
    { isSelected: false },
    {
      where: {
        hiaRankingId,
        actionId: { [Op.notIn]: selectedActionIds },
      },
    },
  );
}

/**
 * Persist HIAP action selections for an inventory + action type.
 * Ranked selections are applied by stable actionId across every language row.
 * Unranked selections are written for all supported languages.
 */
export async function updateHiapActionSelections({
  inventoryId,
  actionType,
  selectedIds,
  authorId,
}: {
  inventoryId: string;
  actionType: ACTION_TYPES;
  selectedIds: string[];
  authorId: string;
}): Promise<number> {
  const rankings = await db.models.HighImpactActionRanking.findAll({
    where: { inventoryId, type: actionType },
  });
  const rankingIds = rankings.map((ranking) => ranking.id);

  const rankedRecordIds: string[] = [];
  const unrankedActionIds: string[] = [];

  for (const selectedId of selectedIds) {
    if (UUID_REGEX.test(selectedId)) {
      rankedRecordIds.push(selectedId);
    } else {
      unrankedActionIds.push(selectedId);
    }
  }

  let updatedCount = 0;

  if (rankingIds.length > 0) {
    // Resolve current-language row UUIDs to stable actionIds
    const selectedRankedRows =
      rankedRecordIds.length > 0
        ? await db.models.HighImpactActionRanked.findAll({
            where: {
              id: rankedRecordIds,
              hiaRankingId: rankingIds,
            },
            attributes: ["actionId"],
          })
        : [];

    const selectedActionIds = [
      ...new Set(selectedRankedRows.map((row) => row.actionId)),
    ];

    // Deselect every language row whose actionId is not selected
    const deselectWhere =
      selectedActionIds.length > 0
        ? {
            hiaRankingId: rankingIds,
            actionId: { [Op.notIn]: selectedActionIds },
          }
        : { hiaRankingId: rankingIds };

    const [, changedDeselectedEntries] =
      await db.models.HighImpactActionRanked.update(
        { isSelected: false },
        {
          where: deselectWhere,
          returning: true,
        },
      );

    await VersionHistoryService.bulkCreateVersions(
      inventoryId,
      "HighImpactActionRanked",
      authorId,
      changedDeselectedEntries,
      false,
      undefined,
      "hiap",
    );

    if (selectedActionIds.length > 0) {
      // Select matching actionIds in every language for this action type
      const [affectedCount, changedEntries] =
        await db.models.HighImpactActionRanked.update(
          { isSelected: true },
          {
            where: {
              hiaRankingId: rankingIds,
              actionId: { [Op.in]: selectedActionIds },
            },
            returning: true,
          },
        );
      updatedCount += affectedCount;

      await VersionHistoryService.bulkCreateVersions(
        inventoryId,
        "HighImpactActionRanked",
        authorId,
        changedEntries,
        false,
        undefined,
        "hiap",
      );
    }
  }

  // Replace unranked selections for this inventory + action type only
  await db.models.UnrankedActionSelection.destroy({
    where: {
      inventoryId,
      actionType,
    },
  });

  if (unrankedActionIds.length > 0) {
    const languages = Object.values(LANGUAGES);
    const unrankedSelections = unrankedActionIds.flatMap((actionId) =>
      languages.map((lang) => ({
        inventoryId,
        actionId,
        actionType,
        lang,
        isSelected: true,
      })),
    );

    await db.models.UnrankedActionSelection.bulkCreate(unrankedSelections);
    updatedCount += unrankedActionIds.length;
  }

  await syncHIAPSelections({ inventoryId, actionType, authorId });

  return updatedCount;
}

/**
 * Migrates HIAP action selections for all cities in a project.
 *
 * Logic:
 * 1. Fetch all cities with the received project id
 * 2. For each city:
 *    - Grab the city's locode from the database
 *    - For each action type:
 *      - Read the corresponding file from S3
 *      - Parse the file
 *      - For each action_id in the file:
 *        - Find the action_id in the HighImpactActionRanked table
 *        - Set the action's is_selected to true in the db
 */
export async function migrateProjectActionSelections(
  projectId: string,
  year: number,
): Promise<void> {
  try {
    logger.info(
      `Starting HIAP action selection migration for project: ${projectId}`,
    );

    // Step 1: Fetch all cities with the received project id
    const cities = await db.models.City.findAll({
      where: { projectId, country: "Brazil" },
      attributes: ["cityId", "locode", "name"],
    });

    if (cities.length === 0) {
      logger.info(`No cities found for project: ${projectId}`);
      return;
    }

    logger.info(`Found ${cities.length} cities for project: ${projectId}`);

    // Step 2: For each city
    for (const city of cities) {
      const locode = city.locode;
      const cityName = city.name;

      if (!locode) {
        logger.warn(`City ${cityName} has no locode, skipping`);
        continue;
      }

      logger.info(`Processing city: ${cityName} (${locode})`);

      // Step 3: For each action type
      for (const actionType of Object.values(ACTION_TYPES)) {
        try {
          // Step 4: Read the corresponding file from S3
          const selectedActionIds = await readSelectedActionsFile(
            locode,
            actionType,
          );

          if (
            !Array.isArray(selectedActionIds) ||
            selectedActionIds.length === 0
          ) {
            logger.info(
              `No selected actions found for ${locode}, ${actionType}`,
            );
            continue;
          }

          logger.info(
            `Found ${selectedActionIds.length} selected actions for ${locode}, ${actionType}`,
          );

          // Step 5: Get ranking IDs for this locode and action type, filtered by year
          const rankings = await db.models.HighImpactActionRanking.findAll({
            where: { locode, type: actionType },
            include: [
              {
                model: db.models.Inventory,
                as: "inventory",
                where: { year },
                attributes: ["inventoryId", "year"],
              },
            ],
            attributes: ["id"],
          });
          const rankingIds = rankings.map((r) => r.id);

          logger.info(
            `Found ${rankingIds.length} rankings for ${locode}, ${actionType} (year: ${year})`,
          );

          if (rankingIds.length === 0) {
            logger.info(`No rankings found for ${locode}, ${actionType}`);
            continue;
          }

          // Step 6: Update all selected actions in a single batch operation
          const [totalUpdated] = await db.models.HighImpactActionRanked.update(
            { isSelected: true },
            {
              where: {
                actionId: {
                  [Op.in]: selectedActionIds,
                },
                hiaRankingId: {
                  [Op.in]: rankingIds,
                },
              },
            },
          );

          logger.info(
            `Updated ${totalUpdated} action selections for ${locode}, ${actionType}`,
          );
        } catch (error) {
          logger.error(`Error processing ${locode}, ${actionType}: ${error}`);
          // Continue with other cities/types even if one fails
        }
      }
    }

    logger.info(
      `Completed HIAP action selection migration for project: ${projectId}`,
    );
  } catch (error) {
    logger.error(
      `Error in migrateProjectActionSelections for project ${projectId}: ${error}`,
    );
    throw error;
  }
}

// ============================================================================
// END OF HIAP Action Selections Migration Functions
// ============================================================================
