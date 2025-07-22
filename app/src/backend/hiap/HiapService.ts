import { LANGUAGES, ACTION_TYPES } from "@/util/types";
import {S3Client } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { logger } from "@/services/logger";
import { db } from "@/models";
import PopulationService from "../PopulationService";
import {
  getTotalEmissionsBySector,
  EmissionsBySector,
} from "../ResultsService";
import {
  HighImpactActionRanking,
} from "@/models/HighImpactActionRanking";
import { HighImpactActionRankingStatus } from "@/util/types";
import {
  startPrioritization,
  checkPrioritizationProgress,
  getPrioritizationResult,
} from "./HiapApiService";
import { InventoryService } from "../InventoryService";
import GlobalAPIService from "../GlobalAPIService";
import { PrioritizerResponse, PrioritizerCityData } from "./types";


















const HIAP_API_URL = process.env.HIAP_API_URL || "http://hiap-service";
logger.info("Using HIAP API at", HIAP_API_URL);

const getClient = (() => {
  let client: S3Client | null = null;

  return () => {
    if (client) return client;

    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const bucketId = process.env.AWS_S3_BUCKET_ID;

    if (!region || !accessKeyId || !secretAccessKey || !bucketId) {
      logger.error("Missing AWS credentials:", {
        region: !!region,
        accessKeyId: !!accessKeyId,
        secretAccessKey: !!secretAccessKey,
        bucketId: !!bucketId,
      });
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

const streamToString = async (stream: Readable): Promise<string> => {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
};

export interface GlobalApiClimateAction {
  ActionID: string;
  ActionName: string;
  ActionType: ACTION_TYPES[];
  Hazard: string[] | null;
  Sector: string[] | null;
  Subsector: string[] | null;
  PrimaryPurpose: string[];
  Description: string;
  CoBenefits: { [k: string]: number };
  EquityAndInclusionConsiderations: string;
  GHGReductionPotential: { [k: string]: string };
  AdaptationEffectiveness: string | null;
  CostInvestmentNeeded: string | null;
  TimelineForImplementation: string | null;
  Dependencies: string[];
  KeyPerformanceIndicators: string[];
  PowersAndMandates: string[] | null;
  AdaptationEffectivenessPerHazard: { [k: string]: string };
  biome: string | null;
}

export const findExistingRanking = async (
  inventoryId: string,
  locode: string,
  lang: LANGUAGES,
) => {
  const ranking = await db.models.HighImpactActionRanking.findOne({
    where: { locode, inventoryId, langs: [lang] },
    include: [
      {
        model: db.models.HighImpactActionRanked,
        as: "highImpactActionRanked",
      },
    ],
  });
  return ranking;
};

const startActionRankingJob = async (
  inventoryId: string,
  locode: string,
  lang: LANGUAGES,
  type: ACTION_TYPES,
) => {
  const contextData = await getCityContextAndEmissionsData(inventoryId);
  logger.info({ contextData }, 'City context and emissions data fetched');
  if (!contextData) throw new Error('No city context/emissions data found');
  const { taskId } = await startPrioritization(contextData, type);
  logger.info({ taskId }, 'Task ID received from HIAP API');
  if (!taskId) throw new Error('No taskId returned from HIAP API');
  const ranking = await db.models.HighImpactActionRanking.create({
    locode,
    inventoryId,
    langs: Object.values(LANGUAGES),
    type,
    jobId: taskId,
    status: HighImpactActionRankingStatus.PENDING,
  });
  logger.info({ ranking }, 'Ranking created in DB');

  // Do not await here, it will make the request time out. Poll job in the background.
  checkActionRankingJob(ranking, lang, type);
  return ranking;
};

async function fetchAndMergeRankedActions(
  lang: LANGUAGES,
  rankedActions: { actionId: string; rank: number; explanation: any; type: ACTION_TYPES }[],
) {
  const allActions = await GlobalAPIService.fetchAllClimateActions(lang);
  
  return rankedActions.map((rankedAction) => {
    const details = allActions.find((a: any) => a.ActionID === rankedAction.actionId);
    if (!details) {
      logger.error(`No action details found for ActionID: ${rankedAction.actionId}`);
      return null;
    }
    
    return {
      ...rankedAction,
      explanation: rankedAction.explanation,
      name: details.ActionName,
      hazard: details.Hazard,
      sector: details.Sector,
      subsector: details.Subsector,
      primaryPurpose: details.PrimaryPurpose,
      description: details.Description,
      cobenefits: details.CoBenefits,
      equityAndInclusionConsiderations: details.EquityAndInclusionConsiderations,
      GHGReductionPotential: details.GHGReductionPotential,
      adaptationEffectiveness: details.AdaptationEffectiveness,
      costInvestmentNeeded: details.CostInvestmentNeeded,
      timelineForImplementation: details.TimelineForImplementation,
      dependencies: details.Dependencies,
      keyPerformanceIndicators: (details.KeyPerformanceIndicators),
      powersAndMandates: (details.PowersAndMandates),
      adaptationEffectivenessPerHazard: details.AdaptationEffectivenessPerHazard,
      biome: details.biome,
    };
  }).filter((r) => r !== null);
}

// Helper: Save ranked actions for a language
async function saveRankedActionsForLanguage(
  ranking: HighImpactActionRanking,
  rankedActions: any[],
  lang: LANGUAGES,
) {
  const updatedRanking = await db.models.HighImpactActionRanking.findByPk(ranking.id);
  if (updatedRanking?.status !== HighImpactActionRankingStatus.PENDING) {
    return;// trying to avoid race condition, if another thread already processed the ranking, don't store the actions again.
  }
  // Always fetch and merge details in the requested language
  const mergedRanked = await fetchAndMergeRankedActions(lang, rankedActions);
  const createRankedAction = async (rankedAction: any) => {
    if (!rankedAction) return;
    try {
      await db.models.HighImpactActionRanked.create({
        hiaRankingId: ranking.id,
        lang: lang,
        actionId: rankedAction.actionId,
        rank: rankedAction.rank,
        type: rankedAction.type,
        explanation: rankedAction.explanation,
        name: rankedAction.name,
        hazards: rankedAction.hazard,
        sectors: rankedAction.sector,
        subsectors: rankedAction.subsector, 
        primaryPurposes: rankedAction.primaryPurpose,
        description: rankedAction.description,
        cobenefits: rankedAction.cobenefits,
        equityAndInclusionConsiderations: rankedAction.equityAndInclusionConsiderations,
        GHGReductionPotential: rankedAction.GHGReductionPotential,
        adaptationEffectiveness: rankedAction.adaptationEffectiveness,
        costInvestmentNeeded: rankedAction.costInvestmentNeeded,
        timelineForImplementation: rankedAction.timelineForImplementation,
        dependencies: rankedAction.dependencies,
        keyPerformanceIndicators: rankedAction.keyPerformanceIndicators,
        powersAndMandates: rankedAction.powersAndMandates,
        adaptationEffectivenessPerHazard: rankedAction.adaptationEffectivenessPerHazard,
        biome: rankedAction.biome,
      });
      return true;
    } catch (err) {
      logger.error("Failed to save ranked action", { rankedAction, err });
      return false;
    }
  };

  const results = await Promise.all(mergedRanked.map(createRankedAction));
  let savedCount = results.filter(Boolean).length;
  logger.info(`[saveRankedActionsForLanguage] Saved ${savedCount} out of ${mergedRanked.length} ranked actions for lang ${lang}.`);
}

export const checkActionRankingJob = async (
  ranking: HighImpactActionRanking,
  lang: LANGUAGES,
  type: ACTION_TYPES,
) => {
  const { locode, inventoryId, jobId } = ranking;
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
      const statusData = await checkPrioritizationProgress(jobId);
      logger.info("Polled job status:", jobStatus);
      switch (statusData.status) {
        case "completed":
          jobStatus = HighImpactActionRankingStatus.SUCCESS;
          break;
        case "failed":
          jobStatus = HighImpactActionRankingStatus.FAILURE;
          await ranking.update({
            status: HighImpactActionRankingStatus.FAILURE,
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
      await getPrioritizationResult(jobId);

      // Merge and save ranked actions with details for this language
    const rankedActions = [
      ...actionRanking.rankedActionsMitigation.map((a) => ({ ...a, type: ACTION_TYPES.Mitigation })),
      ...actionRanking.rankedActionsAdaptation.map((a) => ({ ...a, type: ACTION_TYPES.Adaptation })),
    ];
    const mergedRanked = await fetchAndMergeRankedActions(lang, rankedActions);
    await saveRankedActionsForLanguage(ranking, mergedRanked, lang);

    await ranking.update({ status: HighImpactActionRankingStatus.SUCCESS });
    return ranking;
  } catch (err) {
    logger.error({ err }, "Error in runActionRankingJob");
  }
};

// Helper to get emissions for a sector by name
function getSectorEmissions(emissionsBySector: any[], sectorName: string): number | null {
  const value = emissionsBySector.find((s) => s.sectorName === sectorName)?.co2eq;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

async function getCityContextAndEmissionsData(
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
  const populationSize = await PopulationService.getPopulationDataForCityYear(
    city.cityId,
    inventory.year!,
  );
  const emissionsBySector = await getTotalEmissionsBySector([inventoryId]);
  const cityData: PrioritizerCityData = {
    cityContextData: {
      locode: city.locode!,
      populationSize: populationSize.population!,
    },
    cityEmissionsData: {
      stationaryEnergyEmissions: getSectorEmissions(emissionsBySector, "Stationary Energy"),
      transportationEmissions: getSectorEmissions(emissionsBySector, "Transportation"),
      wasteEmissions: getSectorEmissions(emissionsBySector, "Waste"),
      ippuEmissions: getSectorEmissions(emissionsBySector, "IPPU"),
      afoluEmissions: getSectorEmissions(emissionsBySector, "Agriculture, Forestry, and Other Land Use (AFOLU)"),
    },
  };
  return cityData;
}

// Helper: Find a ranking for the requested language, or any ranking for the inventory/locode
async function findOrSelectRanking(
  inventoryId: string,
  locode: string,
  lang: LANGUAGES,
) {
  let ranking = await findExistingRanking(inventoryId, locode, lang);
  if (!ranking) {
    ranking = await db.models.HighImpactActionRanking.findOne({
      where: { inventoryId, locode },
      order: [["created", "ASC"]],
    });
  }
  return ranking;
}

// Helper: Get ranked actions for a ranking and language
async function getRankedActionsForLang(ranking: any, lang: LANGUAGES, type?: ACTION_TYPES) {
  const whereClause: any = { hiaRankingId: ranking.id, lang };
  
  // Add type filter only if type is provided
  if (type) {
    whereClause.type = type;
  }
  
  const actions = await db.models.HighImpactActionRanked.findAll({
    where: whereClause,
    order: [['rank', 'ASC']],
  });
  
  return actions;
}

// Helper: Copy actions from any language to the requested language
async function copyRankedActionsToLang(ranking: any, lang: LANGUAGES) {
  const anyLangRanked = await db.models.HighImpactActionRanked.findAll({
    where: { hiaRankingId: ranking.id },
    order: [["rank", "ASC"]],
  });
  if (
    anyLangRanked.length === 0 &&
    ranking.status !== HighImpactActionRankingStatus.PENDING
  ) {
    throw new Error("No existing ranked actions found for this ranking");
  }
  const rankedActions = anyLangRanked.map((r) => ({
    actionId: r.actionId,
    rank: r.rank,
    explanation: r.explanation,
    type: r.type,
  }));
  await saveRankedActionsForLanguage(ranking, rankedActions, lang);
  return getRankedActionsForLang(ranking, lang);
}

// Main orchestrator
export const fetchRanking = async (
  inventoryId: string,
  type: ACTION_TYPES,
  lang: LANGUAGES,
) => {
  try {
    const locode = await InventoryService.getLocode(inventoryId);
    const ranking = await findOrSelectRanking(inventoryId, locode, lang);
    if (ranking) {
      // Return if already have ranked actions for this language
      const existingRanked = await getRankedActionsForLang(ranking, lang, type);
      if (existingRanked.length > 0) {
        return { ...ranking.toJSON(), rankedActions: existingRanked };
      }
      // If ranking is pending, trigger job in background and return empty actions
      if (ranking.status === HighImpactActionRankingStatus.PENDING) {
        logger.info('Ranking is pending, triggering background job');
        checkActionRankingJob(ranking, lang, type);
        return { ...ranking.toJSON(), rankedActions: [] };
      } else if (ranking.status === HighImpactActionRankingStatus.SUCCESS) {
        logger.info('Ranking is success, copying actions to requested language');
        const newRanked = await copyRankedActionsToLang(ranking, lang);
        return { ...ranking.toJSON(), rankedActions: newRanked };
      } else if (ranking.status === HighImpactActionRankingStatus.FAILURE) {
        logger.info('Ranking is failure, starting new job');
        return await startActionRankingJob(inventoryId, locode, lang, type);
      }
      logger.info('No ranking found, starting new job');
      return await startActionRankingJob(inventoryId, locode, lang, type);
    } else {
      logger.info('No ranking found at all, starting new job');
      return await startActionRankingJob(inventoryId, locode, lang, type);
    }
  } catch (err) {
    logger.error({ err: err }, 'Error fetching prioritized climate actions:');
    throw err;
  }
};
