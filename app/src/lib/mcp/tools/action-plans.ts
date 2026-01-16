import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { AppSession } from "@/lib/auth";
import { logger } from "@/services/logger";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { InventoryService } from "@/backend/InventoryService";
import { copyRankedActionsToLang } from "@/backend/hiap/HiapService";
import UserService from "@/backend/UserService";
import { LANGUAGES, ACTION_TYPES, HighImpactActionRankingStatus } from "@/util/types";
import { db } from "@/models";
import { Op } from "sequelize";

export const getClimateActionPlansTool: Tool = {
  name: "get_climate_action_plans", 
  description: "Get ranked climate actions and HIAP (Health Impact Assessment and Prioritization) results for an inventory",
  inputSchema: {
    type: "object",
    properties: {
      inventoryId: {
        type: "string",
        description: "The inventory ID to get climate actions for",
      },
      actionType: {
        type: "string",
        enum: ["mitigation", "adaptation"],
        description: "Type of climate actions to retrieve (mitigation or adaptation)",
        default: "mitigation",
      },
      language: {
        type: "string",
        enum: ["en", "es", "pt", "fr", "de"],
        description: "Language for action descriptions",
        default: "en",
      },
      limit: {
        type: "number",
        description: "Maximum number of actions to return (default: 20)",
        default: 20,
      },
    },
    required: ["inventoryId"],
  },
};

export async function execute(
  params: {
    inventoryId: string;
    actionType?: string;
    language?: string; 
    limit?: number;
  },
  session: AppSession
): Promise<any> {
  try {
    const { 
      inventoryId,
      actionType = "mitigation",
      language = "en",
      limit = 20
    } = params;
    
    const type = actionType as ACTION_TYPES;
    const lng = language as LANGUAGES;
    
    logger.debug({ 
      inventoryId, 
      actionType: type, 
      language: lng, 
      userId: session.user.id 
    }, "MCP: Fetching climate action plans");

    // Check access permission
    await PermissionService.canAccessInventory(session, inventoryId);

    // Get inventory details using existing service
    const inventory = await UserService.findUserInventory(inventoryId, session);

    const locode = await InventoryService.getLocode(inventoryId);

    // First try to find a ranking that includes the requested language
    let ranking = await db.models.HighImpactActionRanking.findOne({
      where: {
        inventoryId,
        locode,
        type,
        langs: { [Op.contains]: [lng] }, // Check if the langs array contains this language
      },
      order: [["created", "DESC"]],
    });

    // If no ranking found with the requested language, try to find ANY ranking for this inventory/type
    if (!ranking) {
      logger.info(
        { inventoryId, locode, type, requestedLang: lng },
        "No ranking found with requested language, searching for any ranking",
      );

      ranking = await db.models.HighImpactActionRanking.findOne({
        where: {
          inventoryId,
          locode,
          type,
        },
        order: [["created", "DESC"]],
      });
    }

    if (!ranking) {
      return {
        success: true,
        data: {
          status: "not_found",
          message: "No climate action plans available for this inventory yet",
          rankedActions: [],
          rankingId: null,
          inventoryId,
          inventoryName: inventory.inventoryName,
          year: inventory.year,
        }
      };
    }

    // Get existing actions for this language and type
    let existingActions = await db.models.HighImpactActionRanked.findAll({
      where: {
        hiaRankingId: ranking.id,
        lang: lng,
        type: type
      },
      order: [["rank", "ASC"]],
      limit: limit,
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
        // Apply limit after copying
        existingActions = existingActions.slice(0, limit);
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

    // Check if ranking is still pending
    if (ranking.status === HighImpactActionRankingStatus.PENDING) {
      return {
        success: true,
        data: {
          ...ranking.toJSON(),
          status: HighImpactActionRankingStatus.PENDING,
          message: "Climate action plans are still being generated. Please check back later.",
          rankedActions: [],
          inventoryId,
          inventoryName: inventory.inventoryName,
          year: inventory.year,
        },
      };
    }

    const response = {
      ...ranking.toJSON(),
      status: ranking.status || HighImpactActionRankingStatus.PENDING,
      rankedActions: existingActions,
      inventoryId,
      inventoryName: inventory.inventoryName,
      year: inventory.year,
      city: {
        id: inventory.city?.cityId,
        name: inventory.city?.name,
        country: inventory.city?.country,
        locode: inventory.city?.locode,
      },
    };

    logger.info(
      { 
        inventoryId, 
        userId: session.user.id, 
        actionCount: existingActions.length,
        actionType: type,
        status: ranking.status,
      },
      "MCP: Successfully fetched climate action plans"
    );

    return {
      success: true,
      data: response,
    };
  } catch (error) {
    logger.error({ 
      error, 
      inventoryId: params.inventoryId,
      actionType: params.actionType 
    }, "MCP: Error fetching climate action plans");
    
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch climate action plans",
      data: null,
    };
  }
}