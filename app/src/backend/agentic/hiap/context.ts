import { db } from "@/models";
import ActionPlanService from "@/backend/hiap/ActionPlanService";
import ActionService from "@/backend/hiap/ActionService";
import { ModuleService } from "@/backend/ModuleService";
import type { Inventory } from "@/models/Inventory";
import { Modules } from "@/util/constants";
import { ACTION_TYPES, type LANGUAGES } from "@/util/types";

function compactAction(action: any) {
  return {
    id: action.id,
    actionId: action.actionId,
    hiaRankingId: action.hiaRankingId,
    rank: action.rank,
    name: action.name,
    type: action.type,
    isSelected: action.isSelected,
    sectors: action.sectors ?? [],
    subsectors: action.subsectors ?? [],
    hazards: action.hazards ?? [],
    primaryPurposes: action.primaryPurposes ?? [],
    description: action.description,
    costInvestmentNeeded: action.costInvestmentNeeded,
    timelineForImplementation: action.timelineForImplementation,
    GHGReductionPotential: action.GHGReductionPotential,
    adaptationEffectiveness: action.adaptationEffectiveness,
    adaptationEffectivenessPerHazard: action.adaptationEffectivenessPerHazard,
    keyPerformanceIndicators: action.keyPerformanceIndicators ?? [],
    powersAndMandates: action.powersAndMandates ?? [],
    explanation: action.explanation,
    lang: action.lang,
  };
}

function summarizeActionSet(payload: {
  ranking: any;
  rankedActions: any[];
  unrankedActions: any[];
}) {
  const rankedActions = payload.rankedActions.map(compactAction);
  const unrankedActions = payload.unrankedActions.map(compactAction);
  const selectedActions = [...rankedActions, ...unrankedActions].filter(
    (action) => action.isSelected,
  );

  return {
    ranking: payload.ranking
      ? {
          id: payload.ranking.id,
          status: payload.ranking.status,
          type: payload.ranking.type,
          langs: payload.ranking.langs,
          jobId: payload.ranking.jobId,
          created: payload.ranking.created,
          lastUpdated: payload.ranking.lastUpdated,
        }
      : null,
    rankedActions,
    selectedActions,
    counts: {
      ranked: rankedActions.length,
      unranked: unrankedActions.length,
      selected: selectedActions.length,
    },
    unrankedActions,
    unrankedPreview: unrankedActions.slice(0, 10),
  };
}

export async function buildHiapContext(params: {
  inventory: Inventory;
  lng?: string;
}) {
  const lng = (params.lng || "en") as LANGUAGES;
  const inventory = params.inventory;
  if (!inventory.cityId) {
    throw new Error("HIAP context requires an inventory city id");
  }
  const cityId = inventory.cityId;
  const city = await db.models.City.findByPk(cityId);

  const hasModuleAccess = city?.projectId
    ? await ModuleService.hasModuleAccess(city.projectId, Modules.HIAP.id)
    : false;

  const [mitigationData, adaptationData] = await Promise.all([
    ActionService.getActions(
      inventory.inventoryId,
      ACTION_TYPES.Mitigation,
      lng,
    ),
    ActionService.getActions(
      inventory.inventoryId,
      ACTION_TYPES.Adaptation,
      lng,
    ),
  ]);

  const allActionIds = [
    ...mitigationData.rankedActions,
    ...mitigationData.unrankedActions,
    ...adaptationData.rankedActions,
    ...adaptationData.unrankedActions,
  ]
    .map((action: any) => action.actionId)
    .filter(
      (actionId: unknown): actionId is string => typeof actionId === "string",
    );

  const uniqueActionIds = Array.from(new Set(allActionIds));
  const actionPlans = (
    await Promise.all(
      uniqueActionIds.map((actionId) =>
        ActionPlanService.getActionPlansByCityId(cityId, lng, actionId).catch(
          () => [],
        ),
      ),
    )
  )
    .flat()
    .map((plan: any) => ({
      id: plan.id,
      actionId: plan.actionId,
      actionName: plan.actionName,
      language: plan.language,
      cityLocode: plan.cityLocode,
      inventoryId: plan.inventoryId,
      created: plan.created,
      lastUpdated: plan.lastUpdated,
    }));

  return {
    city: {
      cityId: city?.cityId ?? cityId,
      name: city?.name,
      locode: city?.locode,
      region: city?.region,
      country: city?.country,
      countryLocode: city?.countryLocode,
      regionLocode: city?.regionLocode,
      area: city?.area,
    },
    inventory: {
      inventoryId: inventory.inventoryId,
      cityId,
      year: inventory.year,
      inventoryName: inventory.inventoryName,
      inventoryType: inventory.inventoryType,
      totalEmissions: inventory.totalEmissions,
      globalWarmingPotentialType: inventory.globalWarmingPotentialType,
    },
    module_access: {
      moduleId: Modules.HIAP.id,
      hasAccess: hasModuleAccess,
    },
    mitigation: summarizeActionSet(mitigationData),
    adaptation: summarizeActionSet(adaptationData),
    action_plans: actionPlans,
  };
}
