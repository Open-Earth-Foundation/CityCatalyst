import { LANGUAGES, ACTION_TYPES } from "@/util/types";
import {S3Client } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { logger } from "@/services/logger";
import { db } from "@/models";
import PopulationService from "./PopulationService";
import {
  getTotalEmissionsBySector,
  EmissionsBySector,
} from "./ResultsService";
import {
  HighImpactActionRanking,
} from "@/models/HighImpactActionRanking";
import { HighImpactActionRankingStatus } from "@/util/types";
import {
  startPrioritization,
  checkPrioritizationProgress,
  getPrioritizationResult,
} from "./HiapApiService";
import { InventoryService } from "./InventoryService";
import GlobalAPIService from "./GlobalAPIService";

export interface CityContextData {
  locode: string;
  populationSize: number | null;
}

export interface CityEmissionsData {
  stationaryEnergyEmissions: number | null;
  transportationEmissions: number | null;
  wasteEmissions: number | null;
  ippuEmissions: number | null;
  afoluEmissions: number | null;
}

export interface PrioritizerCityData {
  cityContextData: CityContextData;
  cityEmissionsData: CityEmissionsData;
}

export interface PrioritizerRequest {
  cityData: PrioritizerCityData;
}

export interface PrioritizerResponseMetadata {
  locode: string;
  rankedDate: string;
}

export interface PrioritizerRankedAction {
  actionId: string;
  rank: number;
  explanation: {
    en: string;
    es: string;
    pt: string;
  };
}

export interface PrioritizerResponse {
  metadata: PrioritizerResponseMetadata;
  rankedActionsMitigation: PrioritizerRankedAction[];
  rankedActionsAdaptation: PrioritizerRankedAction[];
}

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
    where: { locode, inventoryId, lang },
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
  if (!contextData) throw new Error("No city context/emissions data found");

  // Use HiapApiService
  const { taskId } = await startPrioritization(contextData);
  if (!taskId) throw new Error("No taskId returned from HIAP API");
  const ranking = await db.models.HighImpactActionRanking.create({
    locode,
    inventoryId,
    lang,
    jobId: taskId,
    status: HighImpactActionRankingStatus.PENDING,
  });
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
  if (updatedRanking?.status === HighImpactActionRankingStatus.PENDING) {
    return;// trying to avoid race condition, if another thread already processed the ranking, don't store the actions again.
  }
  // Always fetch and merge details in the requested language
  const mergedRanked = await fetchAndMergeRankedActions(lang, rankedActions);
  let savedCount = 0;
  for (const rankedAction of mergedRanked) {
    if (!rankedAction) continue;
    try {
      await db.models.HighImpactActionRanked.create({
        hiaRankingId: ranking.id,
        lang: lang,
        actionId: rankedAction.actionId,
        rank: rankedAction.rank,
        type: rankedAction.type,
        explanation: rankedAction.explanation,
        name: rankedAction.name,
        hazard: rankedAction.hazard,
        sector: rankedAction.sector,
        subsector: rankedAction.subsector,
        primaryPurpose: rankedAction.primaryPurpose,
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
      savedCount++;
    } catch (err) {
      logger.error("Failed to save ranked action", { rankedAction, err });
    }
  }
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

async function getCityContextAndEmissionsData(
  inventoryId: string,
): Promise<PrioritizerCityData> {
  // Get inventory to access city information
  const inventory = await db.models.Inventory.findByPk(inventoryId, {
    include: [{ model: db.models.City, as: "city" }],
  });
  if (!inventory || !inventory.city) {
    throw new Error("Inventory or city not found");
  }

  const locode = inventory.city.locode;
  if (!locode) {
    throw new Error("City locode not found");
  }

  const population = await PopulationService.getPopulationDataForCityYear(
    inventory.city.cityId,
    inventory.year!,
  );
  const emissions: EmissionsBySector[] = await getTotalEmissionsBySector([
    inventory.inventoryId,
  ]);
  
  const cityData = {
    cityContextData: {
      locode: locode,
      populationSize: population.population || null,
    },
    cityEmissionsData: {
      stationaryEnergyEmissions:
        Number(
          emissions.find((e) => e.sector_name === "Stationary Energy")?.co2eq,
        ) ?? null,
      transportationEmissions:
        Number(
          emissions.find((e) => e.sector_name === "Transportation")?.co2eq,
        ) ?? null,
      wasteEmissions:
        Number(emissions.find((e) => e.sector_name === "Waste")?.co2eq) ?? null,
      ippuEmissions:
        Number(
          emissions.find(
            (e) =>
              e.sector_name === "Industrial Processes and Product Uses (IPPU)",
          )?.co2eq,
        ) ?? null,
      afoluEmissions:
        Number(
          emissions.find(
            (e) =>
              e.sector_name ===
              "Agriculture, Forestry, and Other Land Use (AFOLU)",
          )?.co2eq,
        ) ?? null,
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
        // Don't await, let it run in background
        checkActionRankingJob(ranking, lang, type);
        return { ...ranking.toJSON(), rankedActions: [] };
      } else if (ranking.status === HighImpactActionRankingStatus.SUCCESS) {
        // Copy actions from any language to the requested language, if available
        const newRanked = await copyRankedActionsToLang(ranking, lang);
        return { ...ranking.toJSON(), rankedActions: newRanked };
      } else if (ranking.status === HighImpactActionRankingStatus.FAILURE) {
        // Job failed, start again
        return await startActionRankingJob(inventoryId, locode, lang, type);
      }
      // No ranking found, start a new job
      return await startActionRankingJob(inventoryId, locode, lang, type);
    }
  } catch (err) {
    logger.error({ err: err }, "Error fetching prioritized climate actions:");
    throw err;
  }
};
