/**
 * @swagger
 * /api/v1/inventory/{inventory}/hiap/status:
 *   get:
 *     tags:
 *       - inventory
 *       - hiap
 *     operationId: getInventoryHiapStatus
 *     summary: Check HIAP job status and get actions if available
 *     description: Returns the current status of any HIAP ranking job and existing actions without starting a new job
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: actionType
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: HIAP status and actions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [pending, success, failure, not_found]
 *                     rankedActions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: Ranked action item
 *                       description: Actions that have been ranked for this inventory
 *                     unrankedActions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: Unranked action item
 *                       description: All other available actions of the requested type that are not ranked
 *                     rankingId:
 *                       type: string
 *                       format: uuid
 */
import { apiHandler } from "@/util/api";
import { LANGUAGES, ACTION_TYPES, HighImpactActionRankingStatus } from "@/util/types";
import { NextRequest } from "next/server";
import UserService from "@/backend/UserService";
import { logger } from "@/services/logger";
import { db } from "@/models";
import { InventoryService } from "@/backend/InventoryService";
import { Op } from "sequelize";
import { copyRankedActionsToLang } from "@/backend/hiap/HiapService";
import GlobalAPIService from "@/backend/GlobalAPIService";

export const GET = apiHandler(async (req: NextRequest, { params, session }) => {
  if (!session) {
    throw new Error("Unauthorized");
  }

  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get("actionType") as ACTION_TYPES;
  const lng = searchParams.get("lng") as LANGUAGES;

  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  if (!type || !lng) {
    throw new Error("Missing required parameters: actionType and lng");
  }

  try {
    const locode = await InventoryService.getLocode(params.inventory);

    // First try to find a ranking that includes the requested language
    let ranking = await db.models.HighImpactActionRanking.findOne({
      where: {
        inventoryId: params.inventory,
        locode,
        type,
        langs: { [Op.contains]: [lng] }, // Check if the langs array contains this language
      },
      order: [["created", "DESC"]],
    });

    // If no ranking found with the requested language, try to find ANY ranking for this inventory/type
    if (!ranking) {
      logger.info(
        { inventoryId: params.inventory, locode, type, requestedLang: lng },
        "No ranking found with requested language in /status, searching for any ranking",
      );

      ranking = await db.models.HighImpactActionRanking.findOne({
        where: {
          inventoryId: params.inventory,
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
      return Response.json({
        data: {
          status: "not_found",
          rankedActions: [],
          rankingId: null
        }
      });
    }

    // Get existing actions for this language and type
    let existingActions = await db.models.HighImpactActionRanked.findAll({
      where: {
        hiaRankingId: ranking.id,
        lang: lng,
        type: type
      },
      order: [["rank", "ASC"]],
    });

    // If ranking is successful but no actions exist for this language, copy them synchronously
    const hasActionsForLang = existingActions.length > 0;
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
        existingActions = await copyRankedActionsToLang(ranking, lng);
        logger.info(
          {
            rankingId: ranking.id,
            lang: lng,
            copiedCount: existingActions.length,
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
        existingActions.map((action: any) => action.actionId)
      );

      // Get unranked action selections from database
      const unrankedSelections = await db.models.UnrankedActionSelection.findAll({
        where: {
          inventoryId: params.inventory,
          actionType: type,
          lang: lng,
          isSelected: true,
        },
      });

      const selectedUnrankedActionIds = new Set(
        unrankedSelections.map((selection: any) => selection.actionId)
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
          rank: existingActions.length + index + 1,
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
          costInvestmentNeeded: action.CostInvestmentNeeded || action.Cost || "",
          timelineForImplementation: action.TimelineForImplementation || action.Timeline || "",
          keyPerformanceIndicators: action.KeyPerformanceIndicators || [],
          powersAndMandates: action.PowersAndMandates || [],
        };

        if (type === "adaptation") {
          return {
            ...baseAction,
            type: "adaptation",
            hazards: action.Hazard || [],
            adaptationEffectiveness: action.AdaptationEffectiveness || "medium",
            adaptationEffectivenessPerHazard: action.AdaptationEffectivenessPerHazard || {},
            qualitativeEffectivenessEvidence: "",
            quantitativeEffectivenessEvidence: "",
            equityAndInclusionConsiderations: action.EquityAndInclusionConsiderations || "",
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
            equityAndInclusionConsiderations: action.EquityAndInclusionConsiderations || "",
            vulnerabilityAnalysisEvidence: "",
            riskReductionEvidence: "",
            socioEconomicImpacts: "",
            liveabilityCobenefits: "",
            ecosystemServices: "",
          };
        }
      });

      logger.info({
        inventoryId: params.inventory,
        type,
        lng,
        totalActionsOfType: actionsOfType.length,
        rankedCount: existingActions.length,
        unrankedCount: unrankedActions.length,
      }, "Fetched unranked actions for status endpoint");
    } catch (error) {
      logger.error({
        err: error,
        inventoryId: params.inventory,
        type,
        lng,
      }, "Failed to fetch unranked actions for status endpoint");
      // Continue with empty unranked actions rather than failing the request
    }

    const response = {
      ...ranking.toJSON(),
      status: ranking.status || HighImpactActionRankingStatus.PENDING,
      rankedActions: existingActions,
      unrankedActions: unrankedActions,
    };

    logger.info({
      inventoryId: params.inventory,
      locode,
      type,
      lng,
      rankedActionCount: existingActions.length,
      unrankedActionCount: unrankedActions.length,
      status: ranking.status,
    }, "HIAP status check completed");

    return Response.json({ data: response });
  } catch (error) {
    logger.error({
      err: error,
      inventory: params.inventory,
      type,
      lng,
    }, "Error checking HIAP status");

    throw new Error(
      `Failed to check HIAP status for city ${inventory.city.locode}: ${(error as Error).message}`,
      { cause: error },
    );
  }
});
