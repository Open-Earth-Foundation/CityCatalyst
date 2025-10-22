import { NextResponse } from "next/server";
import { db } from "@/models";
import { logger } from "@/services/logger";
import {
  HighImpactActionRankingStatus,
  ACTION_TYPES,
  LANGUAGES,
} from "@/util/types";
import { checkBulkActionRankingJob } from "@/backend/hiap/HiapService";
import { BulkHiapPrioritizationService } from "@/backend/hiap/BulkHiapPrioritizationService";
import { Op, QueryTypes } from "sequelize";

/**
 * Cron job endpoint to check HIAP job statuses and start next batches
 * Should be called every minute by Kubernetes CronJob
 * 
 * SECURITY: This endpoint is protected at the network level via Ingress.
 * The ingress blocks /api/cron/* paths from external access (see k8s/cc-ingress.yml).
 * Only internal Kubernetes services can call this endpoint.
 * 
 * @swagger
 * /api/cron/check-hiap-jobs:
 *   get:
 *     tags:
 *       - Cron
 *     summary: Check pending HIAP jobs and continue batch processing
 *     description: Checks status of pending HIAP prioritization jobs and starts next batches when current batches complete
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
export async function GET() {
  const startTime = Date.now();

  logger.info("Cron job: Checking HIAP jobs");

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
    }>(
      `
      SELECT DISTINCT ON ("job_id", "type") 
        "job_id" as "jobId",
        "type",
        "langs"
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
        const isComplete = await checkBulkActionRankingJob(
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
          "Error checking/processing HIAP job",
        );
        // Continue with other jobs even if one fails
      }
    }

    const duration = Date.now() - startTime;

    logger.info(
      {
        checkedJobs: pendingJobs.length,
        completedJobs,
        startedBatches,
        durationMs: duration,
      },
      "Cron job completed",
    );

    return NextResponse.json({
      checkedJobs: pendingJobs.length,
      completedJobs,
      startedBatches,
      durationMs: duration,
    });
  } catch (error: any) {
    logger.error(
      { error: error.message, stack: error.stack },
      "Cron job failed",
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

