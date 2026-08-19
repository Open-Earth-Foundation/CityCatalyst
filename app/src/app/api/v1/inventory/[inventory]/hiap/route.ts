/**
 * @swagger
 * /api/v1/inventory/{inventory}/hiap:
 *   get:
 *     tags:
 *       - inventory
 *       - hiap
 *     operationId: getInventoryHiap
 *     summary: Get HIAP ranking or related data for an inventory.
 *     description: Returns HIAP insights for the selected actionType and language. Requires a signed‑in user with access to the inventory. Response is wrapped in '{' data '}' (actionType‑dependent shape).
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
 *       - in: query
 *         name: ignoreExisting
 *         required: false
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: HIAP result wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     rankedActions:
 *                       type: array
 *                       description: Actions that have been ranked for this inventory
 *                       items:
 *                         type: object
 *                         properties:
 *                           actionId:
 *                             type: string
 *                           rank:
 *                             type: number
 *                           name:
 *                             type: string
 *                           type:
 *                             type: string
 *                     unrankedActions:
 *                       type: array
 *                       description: All other available actions of the requested type that are not ranked
 *                       items:
 *                         type: object
 *                         properties:
 *                           ActionID:
 *                             type: string
 *                           ActionName:
 *                             type: string
 *                           ActionType:
 *                             type: array
 *                             items:
 *                               type: string
 *                           Description:
 *                             type: string
 *                     inventoryId:
 *                       type: string
 *                       format: uuid
 *                     year:
 *                       type: number
 *                     hiapScore:
 *                       type: number
 *                       description: Overall HIAP score for the inventory
 *                     categoryScores:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           category:
 *                             type: string
 *                           score:
 *                             type: number
 *                           indicators:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 indicator:
 *                                   type: string
 *                                 score:
 *                                   type: number
 *                                 description:
 *                                   type: string
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 */
import { apiHandler } from "@/util/api";
import { LANGUAGES } from "@/util/types";
import { ACTION_TYPES } from "@/util/types";
import {
  fetchRanking,
  updateHiapActionSelections,
} from "@/backend/hiap/HiapService";
import { NextRequest, NextResponse } from "next/server";
import UserService from "@/backend/UserService";
import { logger } from "@/services/logger";
import { db } from "@/models";
import { z } from "zod";
import GlobalAPIService from "@/backend/GlobalAPIService";
import createHttpError from "http-errors";
import { getTranslationFromDictionary } from "@/util/helpers";

export const GET = apiHandler(async (req: NextRequest, { params, session }) => {
  if (!session) {
    throw new Error("Unauthorized");
  }

  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get("actionType") as ACTION_TYPES;
  const lng = searchParams.get("lng") as LANGUAGES;
  const ignoreExistingValue = searchParams.get("ignoreExisting");
  const ignoreExisting: boolean = ignoreExistingValue === "true";

  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  if (!type || !lng) {
    throw new Error("Missing required parameters: type and lang");
  }

  try {
    // Get ranked actions
    const rankingData = await fetchRanking(
      params.inventory,
      type,
      lng,
      session,
      ignoreExisting,
    );

    // Get all available climate actions
    const allActions = await GlobalAPIService.fetchAllClimateActions(lng);

    // Filter actions by the requested action type
    const actionsOfType = allActions.filter((action) => {
      return action.ActionType && action.ActionType.includes(type);
    });

    // A brand-new ranking job (just started) has no rankedActions field yet
    const rankedActions =
      "rankedActions" in rankingData ? rankingData.rankedActions : [];

    // Extract ranked action IDs to filter them out from unranked
    const rankedActionIds = new Set(
      rankedActions.map((action) => action.actionId),
    );

    // Get unranked action selections from database (any language — selections are shared)
    const unrankedSelections = await db.models.UnrankedActionSelection.findAll({
      where: {
        inventoryId: params.inventory,
        actionType: type,
        isSelected: true,
      },
    });

    const selectedUnrankedActionIds = new Set(
      unrankedSelections.map((selection) => selection.actionId),
    );

    // Get unranked actions (all actions minus ranked ones) and transform them to HIAction format
    const rawUnrankedActions = actionsOfType.filter((action) => {
      return !rankedActionIds.has(action.ActionID);
    });

    // Transform unranked actions to HIAction format
    const unrankedActions = rawUnrankedActions.map(
      (action, index: number) => {
        const baseAction = {
          id: action.ActionID,
          actionId: action.ActionID,
          name:
            getTranslationFromDictionary(action.ActionName, lng) ??
            action.ActionName ??
            "",
          rank: rankedActions.length + index + 1,
          description:
            getTranslationFromDictionary(action.Description, lng) ??
            action.Description ??
            "",
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
              getTranslationFromDictionary(
                action.EquityAndInclusionConsiderations,
                lng,
              ) ??
              action.EquityAndInclusionConsiderations ??
              "",
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
              getTranslationFromDictionary(
                action.EquityAndInclusionConsiderations,
                lng,
              ) ??
              action.EquityAndInclusionConsiderations ??
              "",
            vulnerabilityAnalysisEvidence: "",
            riskReductionEvidence: "",
            socioEconomicImpacts: "",
            liveabilityCobenefits: "",
            ecosystemServices: "",
          };
        }
      },
    );

    const data = {
      ...rankingData,
      unrankedActions,
    };

    return Response.json({ data });
  } catch (error) {
    logger.error(
      {
        err: error,
        inventory: params.inventory,
        type,
        lng,
      },
      "Error fetching HIAP data",
    );
    throw new Error(
      `Failed to fetch HIAP data for city ${inventory.city.locode}: ${(error as Error).message}`,
      { cause: error },
    );
  }
});

const updateSelectionRequest = z.object({
  selectedActionIds: z.array(z.string()),
});

/**
 * @swagger
 * /api/v1/inventory/{inventory}/hiap:
 *   patch:
 *     tags:
 *       - inventory
 *       - hiap
 *     operationId: patchInventoryHiap
 *     summary: Update selection status of ranked and unranked actions.
 *     description: >
 *       Updates isSelected for the given action type. Ranked selections are
 *       applied by stable actionId across all language rows. Unranked
 *       selections are written for every supported language. Actions not in
 *       selectedActionIds are cleared for this inventory + actionType.
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
 *           enum: [mitigation, adaptation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [selectedActionIds]
 *             properties:
 *               selectedActionIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   description: Ranked row UUID or unranked Global API action ID
 *     responses:
 *       200:
 *         description: Selection updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 updated:
 *                   type: number
 */
export const PATCH = apiHandler(
  async (req: NextRequest, { params, session }) => {
    if (!session) {
      throw new Error("Unauthorized");
    }

    const body = updateSelectionRequest.parse(await req.json());
    const inventory = await UserService.findUserInventory(
      params.inventory,
      session,
    );
    const authorId = session.user.id;
    const inventoryId = params.inventory;
    const actionType = req.nextUrl.searchParams.get(
      "actionType",
    ) as ACTION_TYPES | null;

    if (
      !actionType ||
      !Object.values(ACTION_TYPES).includes(actionType)
    ) {
      throw new createHttpError.BadRequest(
        "Missing or invalid required query parameter: actionType",
      );
    }

    try {
      const updatedCount = await updateHiapActionSelections({
        inventoryId,
        actionType,
        selectedIds: body.selectedActionIds,
        authorId,
      });

      logger.info(
        {
          inventoryId,
          actionType,
          totalSelected: body.selectedActionIds.length,
          updatedCount,
        },
        "Updated HIAP action selection (ranked and unranked)",
      );

      return NextResponse.json({ success: true, updated: updatedCount });
    } catch (error) {
      logger.error(
        {
          err: error,
          inventory: params.inventory,
          selectedActionIds: body.selectedActionIds,
        },
        "Error updating HIAP action selection",
      );
      throw new Error(
        `Failed to update action selection for city ${inventory.city.locode}: ${(error as Error).message}`,
        { cause: error },
      );
    }
  },
);
