import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { db } from "@/models";
import { logger } from "@/services/logger";
import { z } from "zod";
import { ACTION_TYPES } from "@/util/types";

// Type for HighImpactActionRanking with included associations
type HighImpactActionRankingWithIncludes = {
  id: string;
  jobId: string;
  status: string;
  type: string;
  created: Date;
  inventory?: {
    inventoryId: string;
    year: number;
    city?: {
      cityId: string;
      name: string;
      locode: string;
    };
  };
};

const hiapJobsQuerySchema = z.object({
  projectId: z.string().uuid(),
  year: z
    .string()
    .transform((val) => parseInt(val))
    .pipe(z.number().int().min(2000).max(new Date().getFullYear())),
  actionType: z.enum(["mitigation", "adaptation"]),
});

/**
 * @swagger
 * /api/v1/admin/project/{projectId}/hiap-jobs:
 *   get:
 *     tags:
 *       - admin
 *     operationId: getProjectHiapJobs
 *     summary: Get all HIAP prioritization jobs for a project
 *     description: Returns all HIAP prioritization jobs (both completed and in-progress) for all cities in a project
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The project ID
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: The year to filter HIAP jobs
 *       - in: query
 *         name: actionType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [mitigation, adaptation]
 *         description: The action type to filter HIAP jobs
 *     responses:
 *       200:
 *         description: HIAP jobs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       cityId:
 *                         type: string
 *                         format: uuid
 *                       cityName:
 *                         type: string
 *                       inventoryId:
 *                         type: string
 *                         format: uuid
 *                       year:
 *                         type: integer
 *                       taskId:
 *                         type: string
 *                       actionType:
 *                         type: string
 *                         enum: [mitigation, adaptation]
 *                       status:
 *                         type: string
 *                         enum: [pending, running, completed, failed]
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: Bad Request - Invalid parameters (invalid UUID, year out of range, invalid actionType)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 */
export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const { projectId } = params;
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const actionType = searchParams.get("actionType");

  // Validate all parameters using Zod
  const validationResult = hiapJobsQuerySchema.safeParse({
    projectId,
    year,
    actionType,
  });

  if (!validationResult.success) {
    const errors = validationResult.error.errors
      .map((err) => `${err.path.join(".")}: ${err.message}`)
      .join(", ");
    throw new createHttpError.BadRequest(`Validation failed: ${errors}`);
  }

  const {
    projectId: validatedProjectId,
    year: validatedYear,
    actionType: validatedActionType,
  } = validationResult.data;

  // Verify project exists
  const project = await db.models.Project.findByPk(validatedProjectId);
  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  // Get all HIAP rankings for cities in this project with required filters
  const rankings = await db.models.HighImpactActionRanking.findAll({
    include: [
      {
        model: db.models.Inventory,
        as: "inventory",
        attributes: ["inventoryId", "year"],
        where: { year: validatedYear },
        include: [
          {
            model: db.models.City,
            as: "city",
            where: {
              projectId: validatedProjectId,
            },
            attributes: ["cityId", "name", "locode"],
          },
        ],
      },
    ],
    where: {
      type: validatedActionType,
    },
    attributes: ["id", "jobId", "status", "type", "created"],
  });

  // Transform the data to match the expected response format
  const hiapJobs = rankings.map((ranking) => {
    const rankingWithIncludes = ranking as HighImpactActionRankingWithIncludes;
    const city = rankingWithIncludes.inventory?.city;
    const inventory = rankingWithIncludes.inventory;

    if (!city || !inventory) {
        logger.warn(
          `Skipping ranking ${ranking.id}: missing city or inventory data`,
        );
      return null;
    }

    return {
      cityId: city.cityId,
      cityName: city.name,
      inventoryId: inventory.inventoryId,
      year: inventory.year,
      taskId: ranking.jobId,
      actionType: ranking.type,
        status: ranking.status,
        createdAt: ranking.created?.toISOString(),
      };
    })
    .filter((job) => job !== null);

  logger.info(
    `HIAP Jobs API called for project ${validatedProjectId}, year: ${validatedYear}, actionType: ${validatedActionType}, found ${rankings.length} rankings, ${hiapJobs.length} valid jobs`,
  );

  return NextResponse.json({
    data: hiapJobs,
  });
});
