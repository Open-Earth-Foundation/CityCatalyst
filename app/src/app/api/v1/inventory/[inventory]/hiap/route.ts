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
import { fetchRanking } from "@/backend/hiap/HiapService";
import { NextRequest, NextResponse } from "next/server";
import UserService from "@/backend/UserService";
import { logger } from "@/services/logger";
import { db } from "@/models";
import { z } from "zod";
import GlobalAPIService from "@/backend/GlobalAPIService";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const actionsOfType = allActions.filter((action: any) => {
      return action.ActionType && action.ActionType.includes(type);
    });

    // Extract ranked action IDs to filter them out from unranked
    const rankedActionIds = new Set(
      ((rankingData as any).rankedActions || []).map((action: any) => action.actionId)
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

    // Get unranked actions (all actions minus ranked ones) and transform them to HIAction format
    const rawUnrankedActions = actionsOfType.filter((action: any) => {
      return !rankedActionIds.has(action.ActionID);
    });

    // Transform unranked actions to HIAction format
    const unrankedActions = rawUnrankedActions.map((action: any, index: number) => {
      const baseAction = {
        id: action.ActionID,
        actionId: action.ActionID,
        name: action.ActionName,
        rank: ((rankingData as any).rankedActions || []).length + index + 1,
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

    const data = {
      ...rankingData,
      unrankedActions,
    };

    return Response.json({ data });
  } catch (error) {
    logger.error({
      err: error,
      inventory: params.inventory,
      type,
      lng,
    }, "Error fetching HIAP data");
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
 *     summary: Update selection status of ranked actions.
 *     description: Updates the isSelected field for ranked actions. All actions not in the selectedActionIds array will be set to false.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *                   format: uuid
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

    try {
      // Get all ranked actions for this inventory
      const rankings = await db.models.HighImpactActionRanking.findAll({
        where: { inventoryId: params.inventory },
      });

      const rankingIds = rankings.map((r) => r.id);
      
      // Separate ranked action IDs (UUIDs) from unranked action IDs (regular strings)
      const rankedActionIds: string[] = [];
      const unrankedActionIds: string[] = [];
      
      for (const actionId of body.selectedActionIds) {
        // Check if it's a UUID (ranked action database record ID)
        const isUuid = UUID_REGEX.test(actionId);
        
        if (isUuid) {
          rankedActionIds.push(actionId);
        } else {
          unrankedActionIds.push(actionId);
        }
      }

      let updatedCount = 0;

      // Handle ranked actions (existing logic)
      if (rankings.length > 0) {
        // First, set all ranked actions to not selected
        await db.models.HighImpactActionRanked.update(
          { isSelected: false },
          {
            where: {
              hiaRankingId: rankingIds,
            },
          },
        );

        // Then, set selected ranked actions to true
        if (rankedActionIds.length > 0) {
          const [affectedCount] = await db.models.HighImpactActionRanked.update(
            { isSelected: true },
            {
              where: {
                id: rankedActionIds,
                hiaRankingId: rankingIds,
              },
            },
          );
          updatedCount += affectedCount;
        }
      }

      // Handle unranked actions
      // First, clear all existing unranked selections for this inventory
      await db.models.UnrankedActionSelection.destroy({
        where: {
          inventoryId: params.inventory,
        },
      });

      // Then, create new selections for selected unranked actions
      if (unrankedActionIds.length > 0) {
        // We need to determine the action type and language for unranked actions
        // For now, we'll create records for all supported languages and types
        // In a real implementation, you might want to be more specific
        const searchParams = req.nextUrl.searchParams;
        const type = searchParams.get("actionType") || "mitigation";
        const lng = searchParams.get("lng") || "en";

        const unrankedSelections = unrankedActionIds.map((actionId) => ({
          inventoryId: params.inventory,
          actionId,
          actionType: type,
          lang: lng,
          isSelected: true,
        }));

        await db.models.UnrankedActionSelection.bulkCreate(unrankedSelections);
        updatedCount += unrankedActionIds.length;
      }

      logger.info({
        inventoryId: params.inventory,
        rankedActionIds,
        unrankedActionIds,
        totalSelected: body.selectedActionIds.length,
        updatedCount,
      }, "Updated HIAP action selection (ranked and unranked)");

      return NextResponse.json({ success: true, updated: updatedCount });
    } catch (error) {
      logger.error({
        err: error,
        inventory: params.inventory,
        selectedActionIds: body.selectedActionIds,
      }, "Error updating HIAP action selection");
      throw new Error(
        `Failed to update action selection for city ${inventory.city.locode}: ${(error as Error).message}`,
        { cause: error },
      );
    }
  },
);
