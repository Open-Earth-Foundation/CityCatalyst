/**
 * @swagger
 * /api/v1/inventory/{inventory}/hiap/status:
 *   get:
 *     tags:
 *       - Inventory HIAP
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
    
    // Find any existing ranking for this inventory/locode/type
    const ranking = await db.models.HighImpactActionRanking.findOne({
      where: {
        inventoryId: params.inventory,
        locode,
        type,
        langs: { [Op.contains]: [lng] }, // Check if the langs array contains this language
      },
      order: [["created", "DESC"]],
    });

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
    const existingActions = await db.models.HighImpactActionRanked.findAll({
      where: { 
        hiaRankingId: ranking.id, 
        lang: lng,
        type: type
      },
      order: [["rank", "ASC"]],
    });

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