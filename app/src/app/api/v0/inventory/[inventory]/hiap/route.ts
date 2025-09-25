/**
 * @swagger
 * /api/v0/inventory/{inventory}/hiap:
 *   get:
 *     tags:
 *       - Inventory HIAP
 *     summary: Get HIAP ranking or related data for an inventory.
 *     description: Returns HIAP insights for the selected actionType and language. Requires a signed‑in user with access to the inventory. Response is wrapped in { data } (actionType‑dependent shape).
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
 *                 data: { type: object, additionalProperties: true }
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
    const data = await fetchRanking(
      params.inventory,
      type,
      lng,
      session,
      ignoreExisting,
    );
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
  selectedActionIds: z.array(z.string().uuid()),
});

/**
 * @swagger
 * /api/v0/inventory/{inventory}/hiap:
 *   patch:
 *     tags:
 *       - Inventory HIAP
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
 *                 success: { type: boolean }
 *                 updated: { type: number }
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

      if (rankings.length === 0) {
        return NextResponse.json({ success: true, updated: 0 });
      }

      const rankingIds = rankings.map((r) => r.id);

      // First, set all actions to not selected
      await db.models.HighImpactActionRanked.update(
        { isSelected: false },
        {
          where: {
            hiaRankingId: rankingIds,
          },
        },
      );

      // Then, set selected actions to true
      let updatedCount = 0;
      if (body.selectedActionIds.length > 0) {
        const [affectedCount] = await db.models.HighImpactActionRanked.update(
          { isSelected: true },
          {
            where: {
              id: body.selectedActionIds,
              hiaRankingId: rankingIds,
            },
          },
        );
        updatedCount = affectedCount;
      }

      logger.info({
        inventoryId: params.inventory,
        selectedActionIds: body.selectedActionIds,
        updatedCount,
      }, "Updated HIAP action selection");

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
