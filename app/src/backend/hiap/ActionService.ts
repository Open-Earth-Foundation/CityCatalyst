import { logger } from "@/services/logger";
import { db } from "@/models";
import { InventoryService } from "@/backend/InventoryService";
import { Op } from "sequelize";
import { copyRankedActionsToLang } from "@/backend/hiap/HiapService";
import GlobalAPIService from "@/backend/GlobalAPIService";
import {
  HighImpactActionRankingStatus,
  type LANGUAGES,
  type ACTION_TYPES,
} from "@/util/types";

export default class ActionService {
  public static async getActions(
    inventoryId: string,
    type: ACTION_TYPES,
    lng: LANGUAGES,
  ) {
    const locode = await InventoryService.getLocode(inventoryId);

    // First try to find a ranking that includes the requested language
    let ranking = await db.models.HighImpactActionRanking.findOne({
      where: {
        inventoryId: inventoryId,
        locode,
        type,
        langs: { [Op.contains]: [lng] }, // Check if the langs array contains this language
      },
      order: [["created", "DESC"]],
    });

    // If no ranking found with the requested language, try to find ANY ranking for this inventory/type
    if (!ranking) {
      logger.info(
        { inventoryId: inventoryId, locode, type, requestedLang: lng },
        "No ranking found with requested language in /status, searching for any ranking",
      );

      ranking = await db.models.HighImpactActionRanking.findOne({
        where: {
          inventoryId: inventoryId,
          locode,
          type,
        },
        order: [["created", "DESC"]],
      });

      if (ranking) {
        logger.info(
          {
            rankingId: ranking.id,
            rankingLangs: ranking.langs,
            requestedLang: lng,
          },
          "Found ranking with different languages in /status endpoint",
        );
      }
    }

    if (!ranking) {
      return { ranking: null, rankedActions: [], unrankedActions: [] };
    }

    // Get existing actions for this language and type
    let rankedActions = await db.models.HighImpactActionRanked.findAll({
      where: {
        hiaRankingId: ranking.id,
        lang: lng,
        type: type,
      },
      order: [["rank", "ASC"]],
    });

    // If ranking is successful but no actions exist for this language, copy them synchronously
    const hasActionsForLang = rankedActions.length > 0;
    const rankingLangs = ranking.langs as string[];
    const rankingHasLang = rankingLangs.includes(lng);

    if (
      ranking.status === HighImpactActionRankingStatus.SUCCESS &&
      !hasActionsForLang &&
      !rankingHasLang
    ) {
      logger.info(
        {
          rankingId: ranking.id,
          rankingLangs,
          requestedLang: lng,
        },
        "Copying ranked actions to new language synchronously",
      );

      try {
        // Copy actions synchronously and return them immediately
        rankedActions = await copyRankedActionsToLang(ranking, lng);
        logger.info(
          {
            rankingId: ranking.id,
            lang: lng,
            copiedCount: rankedActions.length,
          },
          "Successfully copied ranked actions to new language",
        );
      } catch (error) {
        logger.error(
          {
            err: error,
            rankingId: ranking.id,
            lang: lng,
          },
          "Failed to copy ranked actions to new language",
        );
        // Continue with empty actions rather than failing the request
      }
    }

    // Get all available climate actions and filter out ranked ones to get unranked actions
    let unrankedActions = [];
    try {
      const allActions = await GlobalAPIService.fetchAllClimateActions(lng);

      // Filter actions by the requested action type (mitigation or adaptation)
      const actionsOfType = allActions.filter((action: any) => {
        return action.ActionType && action.ActionType.includes(type);
      });

      // Extract ranked action IDs to filter them out from unranked
      const rankedActionIds = new Set(
        rankedActions.map((action: any) => action.actionId),
      );

      // Get unranked action selections from database
      const unrankedSelections =
        await db.models.UnrankedActionSelection.findAll({
          where: {
            inventoryId: inventoryId,
            actionType: type,
            lang: lng,
            isSelected: true,
          },
        });

      const selectedUnrankedActionIds = new Set(
        unrankedSelections.map((selection: any) => selection.actionId),
      );

      // Get unranked actions (all actions of this type minus ranked ones) and transform them
      const rawUnrankedActions = actionsOfType.filter((action: any) => {
        return !rankedActionIds.has(action.ActionID);
      });

      // Transform unranked actions to HIAction format
      unrankedActions = rawUnrankedActions.map((action: any, index: number) => {
        const baseAction = {
          id: action.ActionID,
          actionId: action.ActionID,
          name: action.ActionName,
          rank: rankedActions.length + index + 1,
          description: action.Description || "",
          explanation: action.Explanation || {},
          isSelected: selectedUnrankedActionIds.has(action.ActionID),
          hiaRankingId: "", // Not applicable for unranked
          lang: lng,
          primaryPurposes: action.PrimaryPurpose || [],
          dependencies: action.Dependencies || [],
          cobenefits: action.CoBenefits || [],
          timeline: "",
          cost: "",
          costEvidence: "",
          implementationBarriers: "",
          otherConsiderations: "",
          feasibility: "",
          institutionalRequirements: "",
          subActions: [],
          monitoringAndEvaluation: "",
          costInvestmentNeeded:
            action.CostInvestmentNeeded || action.Cost || "",
          timelineForImplementation:
            action.TimelineForImplementation || action.Timeline || "",
          keyPerformanceIndicators: action.KeyPerformanceIndicators || [],
          powersAndMandates: action.PowersAndMandates || [],
        };

        if (type === "adaptation") {
          return {
            ...baseAction,
            type: "adaptation",
            hazards: action.Hazard || [],
            adaptationEffectiveness: action.AdaptationEffectiveness || "medium",
            adaptationEffectivenessPerHazard:
              action.AdaptationEffectivenessPerHazard || {},
            qualitativeEffectivenessEvidence: "",
            quantitativeEffectivenessEvidence: "",
            equityAndInclusionConsiderations:
              action.EquityAndInclusionConsiderations || "",
            vulnerabilityAnalysisEvidence: "",
            riskReductionEvidence: "",
            socioEconomicImpacts: "",
            liveabilityCobenefits: "",
            ecosystemServices: "",
            GHGReductionPotential: action.GHGReductionPotential || {},
            sectors: action.Sector || [],
            subsectors: action.Subsector || [],
          };
        } else {
          return {
            ...baseAction,
            type: "mitigation",
            sectors: action.Sector || [],
            subsectors: action.Subsector || [],
            GHGReductionPotential: action.GHGReductionPotential || {},
            hazards: [],
            adaptationEffectiveness: "medium",
            adaptationEffectivenessPerHazard: {},
            qualitativeEffectivenessEvidence: "",
            quantitativeEffectivenessEvidence: "",
            equityAndInclusionConsiderations:
              action.EquityAndInclusionConsiderations || "",
            vulnerabilityAnalysisEvidence: "",
            riskReductionEvidence: "",
            socioEconomicImpacts: "",
            liveabilityCobenefits: "",
            ecosystemServices: "",
          };
        }
      });

      logger.info(
        {
          inventoryId: inventoryId,
          type,
          lng,
          totalActionsOfType: actionsOfType.length,
          rankedCount: rankedActions.length,
          unrankedCount: unrankedActions.length,
        },
        "Fetched unranked actions for status endpoint",
      );
    } catch (error) {
      logger.error(
        {
          err: error,
          inventoryId: inventoryId,
          type,
          lng,
        },
        "Failed to fetch unranked actions for status endpoint",
      );
      // Continue with empty unranked actions rather than failing the request
    }

    return {
      ranking,
      rankedActions,
      unrankedActions,
    };
  }
}
