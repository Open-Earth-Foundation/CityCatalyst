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
import {
  LANGUAGES,
  ACTION_TYPES,
  HighImpactActionRankingStatus,
} from "@/util/types";
import { NextRequest } from "next/server";
import UserService from "@/backend/UserService";
import { logger } from "@/services/logger";
import ActionService from "@/backend/hiap/ActionService";

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
    const { ranking, rankedActions, unrankedActions } =
      await ActionService.getActions(params.inventory, type, lng);

    if (!ranking) {
      return Response.json({
        data: {
          status: "not_found",
          rankedActions: [],
          rankingId: null,
        },
      });
    }

    const response = {
      ...ranking.toJSON(),
      status: ranking.status || HighImpactActionRankingStatus.PENDING,
      rankedActions: rankedActions,
      unrankedActions: unrankedActions,
    };

    logger.info(
      {
        inventoryId: params.inventory,
        type,
        lng,
        rankedActionCount: rankedActions.length,
        unrankedActionCount: unrankedActions.length,
        status: ranking.status,
      },
      "HIAP status check completed",
    );

    return Response.json({ data: response });
  } catch (error) {
    logger.error(
      {
        err: error,
        inventory: params.inventory,
        type,
        lng,
      },
      "Error checking HIAP status",
    );

    throw new Error(
      `Failed to check HIAP status for city ${inventory.city.locode}: ${(error as Error).message}`,
      { cause: error },
    );
  }
});
