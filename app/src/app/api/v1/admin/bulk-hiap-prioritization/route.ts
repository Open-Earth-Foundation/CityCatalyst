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
 *   get:
 *     tags:
 *       - Admin
 *     operationId: getBulkHiapPrioritizationStatus
 *     summary: Get batch status for bulk HIAP prioritization
 *     description: Returns status of all batches for a project, grouped by jobId
 *     parameters:
 *       - in: query
 *         name: projectId
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
 *     responses:
 *       200:
 *         description: Batch status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     batches:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 */
export const GET = apiHandler(async (req: NextRequest, { session, searchParams }) => {
  // Check authentication first
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  // Then check authorization (admin-only endpoint)
  UserService.validateIsAdmin(session);

  const projectId = searchParams.projectId;
  const actionType = searchParams.actionType;

  if (!projectId || !actionType) {
    throw new createHttpError.BadRequest("projectId and actionType are required");
  }

  // Verify project exists
  const project = await db.models.Project.findByPk(projectId);
  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  const batches = await BulkHiapPrioritizationService.getBatchStatus({
    projectId,
    actionType: actionType as ACTION_TYPES,
  });

  return NextResponse.json({ data: { batches } });
});

/**
 * @swagger
 * /api/v1/admin/bulk-hiap-prioritization:
 *   post:
 *     tags:
 *       - Admin
 *     operationId: startBulkHiapPrioritization
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

const retrySchema = z.object({
  projectId: z.string().uuid(),
  actionType: z.enum(["mitigation", "adaptation"]),
  jobIds: z.array(z.string()).optional(),
  excludedCityLocodes: z.array(z.string()).optional(),
});

/**
 * @swagger
 * /api/v1/admin/bulk-hiap-prioritization:
 *   patch:
 *     tags:
 *       - Admin
 *     operationId: retryBulkHiapPrioritization
 *     summary: Retry failed HIAP prioritization batches
 *     description: Resets failed rankings back to TO_DO status so they can be reprocessed by the cron job. Can exclude specific cities that are causing failures.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - actionType
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *               actionType:
 *                 type: string
 *                 enum: [mitigation, adaptation]
 *               jobIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional - specific job IDs to retry. If not provided, retries all failed jobs.
 *               excludedCityLocodes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional - city locodes to exclude from retry. Useful when specific cities cause batch failures.
 *     responses:
 *       200:
 *         description: Failed batches reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     retriedCount:
 *                       type: integer
 *                       description: Number of rankings reset to TO_DO
 *                     excludedCount:
 *                       type: integer
 *                       description: Number of cities excluded from retry
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 */
export const PATCH = apiHandler(async (req: NextRequest, { session }) => {
  // Check authentication first
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  // Then check authorization (admin-only endpoint)
  UserService.validateIsAdmin(session);

  const body = await req.json();
  const { projectId, actionType, jobIds, excludedCityLocodes } =
    retrySchema.parse(body);

  // Verify project exists
  const project = await db.models.Project.findByPk(projectId);
  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  logger.info(
    { projectId, actionType, jobIds, excludedCityLocodes },
    "Retrying failed HIAP prioritization batches",
  );

  const result = await BulkHiapPrioritizationService.retryFailedBatches({
    projectId,
    actionType: actionType as ACTION_TYPES,
    jobIds,
    excludedCityLocodes,
  });

  return NextResponse.json({
    data: {
      retriedCount: result.retriedCount,
      excludedCount: result.excludedCount,
    },
  });
});

const unexcludeSchema = z.object({
  projectId: z.string().uuid(),
  actionType: z.enum(["mitigation", "adaptation"]),
  cityLocodes: z
    .array(z.string())
    .min(1, "At least one city must be specified"),
});

/**
 * @swagger
 * /api/v1/admin/bulk-hiap-prioritization:
 *   put:
 *     tags:
 *       - Admin
 *     operationId: unexcludeHiapCities
 *     summary: Un-exclude cities from HIAP prioritization
 *     description: Moves excluded cities back to TO_DO status so they can be retried
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - actionType
 *               - cityLocodes
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *               actionType:
 *                 type: string
 *                 enum: [mitigation, adaptation]
 *               cityLocodes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 description: City locodes to un-exclude and move back to TO_DO
 *     responses:
 *       200:
 *         description: Cities un-excluded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     unexcludedCount:
 *                       type: integer
 *                       description: Number of cities moved from EXCLUDED to TO_DO
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 */
export const PUT = apiHandler(async (req: NextRequest, { session }) => {
  // Check authentication first
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  // Then check authorization (admin-only endpoint)
  UserService.validateIsAdmin(session);

  const body = await req.json();
  const { projectId, actionType, cityLocodes } = unexcludeSchema.parse(body);

  // Verify project exists
  const project = await db.models.Project.findByPk(projectId);
  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  logger.info(
    { projectId, actionType, cityLocodes },
    "Un-excluding cities from HIAP prioritization",
  );

  const result = await BulkHiapPrioritizationService.unexcludeCities({
    projectId,
    actionType: actionType as ACTION_TYPES,
    cityLocodes,
  });

  return NextResponse.json({
    data: {
      unexcludedCount: result.unexcludedCount,
    },
  });
});
