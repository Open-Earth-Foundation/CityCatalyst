import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import { z } from "zod";
import createHttpError from "http-errors";
import { db } from "@/models";
import { startActionRankingJob } from "@/backend/hiap/HiapService";
import { logger } from "@/services/logger";
import {
  ACTION_TYPES,
  LANGUAGES,
  BulkHiapPrioritizationResult,
  HighImpactActionRankingStatus,
} from "@/util/types";

const bulkPrioritizationSchema = z.object({
  projectId: z.string().uuid(),
  year: z.number().int().min(2000).max(new Date().getFullYear()),
  actionType: z.enum(["mitigation", "adaptation"]),
  languages: z
    .array(z.nativeEnum(LANGUAGES))
    .min(1, "At least one language is required"),
});

/**
 * @swagger
 * /api/v1/admin/bulk-hiap-prioritization:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Start HIAP prioritization for all cities in a project
 *     description: Starts HIAP prioritization jobs for all cities in a project that have inventories for the specified year
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - year
 *               - actionType
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *               year:
 *                 type: integer
 *                 minimum: 2000
 *                 maximum: 2100
 *               actionType:
 *                 type: string
 *                 enum: [mitigation, adaptation]
 *               languages:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [en, es, pt, de, fr]
 *                 minItems: 1
 *     responses:
 *       200:
 *         description: Bulk prioritization started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     startedCount:
 *                       type: integer
 *                     failedCount:
 *                       type: integer
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           cityId:
 *                             type: string
 *                             format: uuid
 *                           cityName:
 *                             type: string
 *                           inventoryId:
 *                             type: string
 *                             format: uuid
 *                           status:
 *                             type: string
 *                             enum: [started, failed]
 *                           error:
 *                             type: string
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found or no inventories found
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { projectId, year, actionType, languages } =
    bulkPrioritizationSchema.parse(body);
  // Verify project exists
  const project = await db.models.Project.findByPk(projectId);
  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  // Get all cities in the project with inventories for the specified year
  const citiesWithInventories = await db.models.City.findAll({
    where: {
      projectId: projectId,
    },
    include: [
      {
        model: db.models.Inventory,
        as: "inventories",
        where: {
          year: year,
        },
        required: true,
        attributes: ["inventoryId", "year"],
      },
    ],
    attributes: ["cityId", "name", "locode"],
  });

  if (!citiesWithInventories || citiesWithInventories.length === 0) {
    // Return empty result instead of throwing an error - this is a valid state
    return NextResponse.json({
      data: {
        startedCount: 0,
        failedCount: 0,
        results: [],
      },
    });
  }

  const results: BulkHiapPrioritizationResult[] = [];

  let startedCount = 0;
  let failedCount = 0;

  // Process each city
  for (const city of citiesWithInventories) {
    // Query the inventory directly to guarantee an exact year match
    const inventory = await db.models.Inventory.findOne({
      where: { cityId: city.cityId, year },
      attributes: ["inventoryId", "year"],
    });
    if (!inventory) {
      logger.info(
        `Skipping city for bulk HIAP: no inventory for requested year. CityId: ${city.cityId}, CityName: ${city.name ?? city.locode ?? ""}, RequestedYear: ${year}`,
      );
      continue; // not a failure; just skip
    }
    const cityName: string = city.name ?? city.locode ?? "";

    // Validate required city data
    if (!city.locode) {
      logger.error(
        `City ${cityName} (ID: ${city.cityId}) has no locode, skipping`,
      );
      continue;
    }

    try {
      const ranking = await startActionRankingJob(
        inventory.inventoryId,
        city.locode,
        languages,
        actionType as ACTION_TYPES,
      );

      logger.info(
        `Started HIAP prioritization for city ${cityName}. CityId: ${city.cityId}, InventoryId: ${inventory.inventoryId}, TaskId: ${ranking.jobId}, ActionType: ${actionType}`,
      );

      results.push({
        cityId: city.cityId,
        cityName,
        inventoryId: inventory.inventoryId,
        status: HighImpactActionRankingStatus.PENDING,
        taskId: ranking.jobId,
      });
      startedCount++;
    } catch (error) {
      logger.error(
        `Failed to start HIAP prioritization for city ${cityName}. CityId: ${city.cityId}, InventoryId: ${inventory.inventoryId}, Error: ${error instanceof Error ? error.message : String(error)}, ActionType: ${actionType}`,
      );

      results.push({
        cityId: city.cityId,
        cityName,
        inventoryId: inventory.inventoryId,
        status: HighImpactActionRankingStatus.FAILURE,
        taskId: "", // No taskId available for failed jobs - no DB record created
        error: error instanceof Error ? error.message : String(error),
      });
      failedCount++;
    }
  }

  return NextResponse.json({
    data: {
      startedCount,
      failedCount,
      results,
    },
  });
});
