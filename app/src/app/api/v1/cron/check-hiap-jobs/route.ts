import { NextRequest, NextResponse } from "next/server";
import { db } from "@/models";
import { logger } from "@/services/logger";
import {
  HighImpactActionRankingStatus,
  ACTION_TYPES,
  LANGUAGES,
} from "@/util/types";
import { checkBulkActionRankingJob } from "@/backend/hiap/HiapService";
import { BulkHiapPrioritizationService } from "@/backend/hiap/BulkHiapPrioritizationService";
import { QueryTypes } from "sequelize";
import { checkSingleActionRankingJob } from "@/backend/hiap/HiapService";

export const API_KEY = process.env.CC_CRON_JOB_API_KEY;

/**
 * Cron job endpoint to check HIAP job statuses and start next batches
 * Should be called every minute by Kubernetes CronJob
 * 

 * 1. Check all PENDING jobs - if completed, save results (mark SUCCESS/FAILURE)
 * 2. If NO PENDING jobs exist anywhere in the system:
 *    - Find ONE project with TO_DO rankings (oldest first, FIFO)
 *    - Start ONE batch for that project
 * 3. If ANY PENDING jobs exist, skip batch starting (wait for completion)
 * 
 * SECURITY: This endpoint is protected at the network level via Ingress.
 * The ingress explicitly blocks both /api/cron/* and /api/v1/cron/* paths from external access (see k8s/cc-ingress.yml).
 * Only internal Kubernetes services can call this endpoint.
 * 
 * @swagger
 * /api/v1/cron/check-hiap-jobs:
 *   get:
 *     tags:
 *       - Cron
 *     summary: Check pending HIAP jobs and continue batch processing
 *     description: |
 *       Checks status of pending HIAP prioritization jobs and starts next batches.
 *       Also starts new batches for projects with TO_DO rankings but no active PENDING jobs.
 *     responses:
 *       200:
 *         description: Cron job completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 checkedJobs:
 *                   type: number
 *                 completedJobs:
 *                   type: number
 *                 startedBatches:
 *                   type: number
 */
export async function GET(req: NextRequest) {
  // validate API key from Authorization header to only allow requests from cron job
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: { message: "Unauthorized, Authorization header missing" } },
      { status: 401 },
    );
  }
  const token = authorization.replace("Bearer ", "").trim();
  if (token.length > 0 && token !== API_KEY) {
    return NextResponse.json(
      { error: { message: "Unauthorized, API key invalid" } },
      { status: 401 },
    );
  }

  const startTime = Date.now();

  logger.info("🔄 Cron job STARTED: Checking HIAP jobs");

  try {
    // Ensure database is initialized
    if (!db.initialized) {
      await db.initialize();
    }

    if (!db.sequelize) {
      throw new Error("Database not initialized");
    }

    // Step 1: Query for PENDING rankings grouped by unique jobId
    // Use DISTINCT to get unique jobIds efficiently in the database
    const pendingJobs = await db.sequelize.query<{
      jobId: string;
      type: ACTION_TYPES;
      langs: string[];
      isBulk: boolean;
    }>(
      `
      SELECT DISTINCT ON ("job_id", "type") 
        "job_id" as "jobId",
        "type",
        "langs",
        "is_bulk" as "isBulk"
      FROM "public"."HighImpactActionRanking"
      WHERE "status" = :status
        AND "job_id" IS NOT NULL
      `,
      {
        replacements: { status: HighImpactActionRankingStatus.PENDING },
        type: QueryTypes.SELECT,
      },
    );

    logger.info(
      { pendingJobCount: pendingJobs.length },
      "Found pending HIAP jobs",
    );

    let completedJobs = 0;
    let startedBatches = 0;

    // Step 2: Check status for each unique jobId
    for (const job of pendingJobs) {
      try {
        const lang = (job.langs as any)[0] as LANGUAGES; // Get first language from array

        // Call appropriate function based on job type
        const isComplete = job.isBulk
          ? await checkBulkActionRankingJob(
              job.jobId,
              lang,
              job.type as ACTION_TYPES,
            )
          : await checkSingleActionRankingJob(
              job.jobId,
              lang,
              job.type as ACTION_TYPES,
            );

        if (isComplete) {
          completedJobs++;

          // Step 3: Get projectId from one of the rankings
          const ranking = await db.models.HighImpactActionRanking.findOne({
            where: { jobId: job.jobId },
            include: [
              {
                model: db.models.Inventory,
                as: "inventory",
                required: true,
                include: [
                  {
                    model: db.models.City,
                    as: "city",
                    required: true,
                    attributes: ["projectId"],
                  },
                ],
              },
            ],
          });

          const projectId = (ranking as any)?.inventory?.city?.projectId;
          if (projectId) {
            // Step 4: Start next batch for this project if there are TO_DO rankings
            const nextBatch =
              await BulkHiapPrioritizationService.startNextBatch(
                projectId,
                job.type as ACTION_TYPES,
              );

            if (nextBatch.started) {
              startedBatches++;
              logger.info(
                {
                  projectId,
                  actionType: job.type,
                  batchSize: nextBatch.batchSize,
                  taskId: nextBatch.taskId,
                },
                "Started next batch",
              );
            }
          }
        }
      } catch (error: any) {
        logger.error(
          { jobId: job.jobId, error: error.message },
          "Error checking/processing HIAP job - marking as FAILURE",
        );

        // Mark all rankings with this jobId as FAILURE to unblock the queue
        try {
          await db.models.HighImpactActionRanking.update(
            {
              status: HighImpactActionRankingStatus.FAILURE,
              errorMessage: `Job check failed: ${error.message}`,
            },
            {
              where: {
                jobId: job.jobId,
                status: HighImpactActionRankingStatus.PENDING,
              },
            },
          );

          logger.info(
            { jobId: job.jobId },
            "Marked PENDING rankings as FAILURE due to job check error",
          );
          completedJobs++;
        } catch (updateError: any) {
          logger.error(
            { jobId: job.jobId, error: updateError.message },
            "Failed to mark rankings as FAILURE",
          );
        }

        // Continue with other jobs even if one fails
      }
    }

    // Step 3: Start ONE batch if no PENDING jobs exist system-wide
    if (pendingJobs.length === 0) {
      logger.info(
        "No PENDING jobs system-wide. Checking for TO_DO rankings to start next batch.",
      );

      // Find ONE project with TO_DO rankings (oldest first for fairness)
      const nextProject = await db.sequelize.query<{
        projectId: string;
        type: ACTION_TYPES;
        oldestCreated: Date;
      }>(
        `
        SELECT c.project_id as "projectId", 
               har.type,
               MIN(har.created) as "oldestCreated"
        FROM "public"."HighImpactActionRanking" har
        JOIN "public"."Inventory" inv ON har.inventory_id = inv.inventory_id
        JOIN "public"."City" c ON inv.city_id = c.city_id
        WHERE har.status = :todoStatus
        GROUP BY c.project_id, har.type
        ORDER BY MIN(har.created) ASC
        LIMIT 1
        `,
        {
          replacements: {
            todoStatus: HighImpactActionRankingStatus.TO_DO,
          },
          type: QueryTypes.SELECT,
        },
      );

      if (nextProject.length > 0) {
        const project = nextProject[0];
        try {
          const nextBatch = await BulkHiapPrioritizationService.startNextBatch(
            project.projectId,
            project.type,
          );

          if (nextBatch.started) {
            startedBatches++;
            logger.info(
              {
                projectId: project.projectId,
                actionType: project.type,
                batchSize: nextBatch.batchSize,
                taskId: nextBatch.taskId,
                oldestCreated: project.oldestCreated,
              },
              "Started next batch",
            );
          }
        } catch (error: any) {
          logger.error(
            {
              projectId: project.projectId,
              actionType: project.type,
              error: error.message,
            },
            "Error starting batch",
          );
        }
      } else {
        logger.info("No TO_DO rankings found. All processing complete.");
      }
    } else {
      logger.info(
        {
          pendingJobCount: pendingJobs.length,
        },
        "PENDING jobs exist. Skipping Step 3 (enforce 1 batch at a time globally).",
      );
    }

    const duration = Date.now() - startTime;

    logger.info(
      {
        checkedJobs: pendingJobs.length,
        completedJobs,
        startedBatches,
        durationMs: duration,
      },
      "✅ Cron job FINISHED successfully",
    );

    return NextResponse.json({
      checkedJobs: pendingJobs.length,
      completedJobs,
      startedBatches,
      durationMs: duration,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error(
      { error: error.message, stack: error.stack, durationMs: duration },
      "❌ Cron job FINISHED with error",
    );
    return NextResponse.json(
      { error: "Internal server error - " + error.message },
      { status: 500 },
    );
  }
}
