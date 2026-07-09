/**
 * @swagger
 * /api/v1/public/project/{projectId}/actions:
 *   get:
 *     tags:
 *       - public
 *     operationId: getPublicProjectActions
 *     summary: Get climate actions for all public cities in a project
 *     description: Public endpoint that returns climate action details only if the city has at least one public inventory. No authentication is required. Response is wrapped in '{' data '}'.
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Climate action details wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     locode:
 *                       type: string
 *                     cityName:
 *                       type: string
 *                     regionName:
 *                       type: string
 *                       nullable: true
 *                     actions:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Invalid project ID.
 *       401:
 *         description: No public data available for this project.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { validate } from "uuid";
import { db } from "@/models";
import { Op } from "sequelize";

export const GET = apiHandler(async (_req, { params }) => {
  const { projectId } = params;

  if (!validate(projectId)) {
    throw new createHttpError.BadRequest(
      `'${projectId}' is not a valid project id (uuid)`,
    );
  }

  // First check if city has any public inventories before fetching city data
  const publicInventories = await db.models.Inventory.findAll({
    where: {
      isPublic: true,
    },
    include: [
      {
        model: db.models.City,
        as: "city",
        where: {
          projectId,
        },
        required: true,
        order: ["name"],
      },
    ],
  });

  if (publicInventories.length === 0) {
    throw new createHttpError.Unauthorized(
      "No public city inventories available for this project",
    );
  }

  const inventoryIds = publicInventories.map(
    (inventory) => inventory.inventoryId,
  );
  const actionRankings = await db.models.HighImpactActionRanking.findAll({
    where: {
      inventoryId: { [Op.in]: inventoryIds },
    },
    include: [
      {
        model: db.models.HighImpactActionRanked,
        as: "highImpactActionsRanked",
      },
    ],
  });
  const actionsByInventoryId: Record<string, any[]> = {};

  actionRankings.map((ranking) => {
    if (!(ranking.inventoryId in actionsByInventoryId)) {
      actionsByInventoryId[ranking.inventoryId] = [];
    }
    actionsByInventoryId[ranking.inventoryId].push(
      ranking.highImpactActionsRanked,
    );
  });

  const results = publicInventories.map((inventory) => {
    return {
      locode: inventory.city.locode,
      cityName: inventory.city.name,
      regionName: inventory.city.region,
      actions: actionsByInventoryId[inventory.inventoryId] ?? [],
    };
  });

  return NextResponse.json({ data: results });
});
