/**
 * @swagger
 * /api/v1/inventory/{inventory}/hiap/status:
 *   get:
 *     tags:
 *       - Inventory HIAP
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

    const response = {
      ...ranking.toJSON(),
      status: ranking.status || HighImpactActionRankingStatus.PENDING,
      rankedActions: existingActions,
    };

    logger.info({
      inventoryId: params.inventory,
      locode,
      type,
      lng,
      actionCount: existingActions.length,
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
