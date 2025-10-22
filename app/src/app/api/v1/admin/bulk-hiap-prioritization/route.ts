/**
 * Bulk HIAP Prioritization API
 *
 * Processes High Impact Action Prioritization for multiple cities in batches.
 *
 * See ./README.md for comprehensive documentation including:
 * - Architecture diagrams
 * - Status flow
 * - Cron job integration
 * - Progress monitoring
 */
import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import { z } from "zod";
import createHttpError from "http-errors";
import { db } from "@/models";
import { BulkHiapPrioritizationService } from "@/backend/hiap/BulkHiapPrioritizationService";
import { logger } from "@/services/logger";
import { ACTION_TYPES, LANGUAGES } from "@/util/types";
import UserService from "@/backend/UserService";

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
 *                     totalCities:
 *                       type: integer
 *                     totalBatches:
 *                       type: integer
 *                     message:
 *                       type: string
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found or no inventories found
 */
export const POST = apiHandler(async (req: NextRequest, { session }) => {
  // Check authentication first
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  // Then check authorization (admin-only endpoint)
  UserService.validateIsAdmin(session);

  const body = await req.json();
  const { projectId, year, actionType, languages } =
    bulkPrioritizationSchema.parse(body);

  // Verify project exists
  const project = await db.models.Project.findByPk(projectId);
  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  logger.info(
    { projectId, year, actionType, languages },
    "Starting bulk HIAP prioritization request",
  );

  try {
    // Create ranking records and start async processing
    const result =
      await BulkHiapPrioritizationService.startBulkPrioritizationAsync({
        projectId,
        year,
        actionType: actionType as ACTION_TYPES,
        languages: languages as LANGUAGES[],
      });

    return NextResponse.json({
      data: {
        totalCities: result.totalCities,
        firstBatchSize: result.firstBatchSize,
        message:
          "First batch started. Cron job will process remaining batches automatically.",
      },
    });
  } catch (error) {
    logger.error(
      { error, projectId, year, actionType },
      "Failed to start bulk HIAP prioritization",
    );
    throw error;
  }
});
