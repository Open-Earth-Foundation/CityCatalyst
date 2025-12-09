import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { db } from "@/models";
import { logger } from "@/services/logger";
import { z } from "zod";
import { migrateProjectActionSelections } from "@/backend/hiap/HiapService";

const migrateSelectionsSchema = z.object({
  projectId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
});

/**
 * @swagger
 * /api/v1/admin/project/{projectId}/migrate-hiap-selections:
 *   post:
 *     tags:
 *       - Admin
 *     operationId: migrateHiapSelections
 *     summary: Migrate HIAP action selections for a project
 *     description: Reads selected action files from S3 and updates the database for all cities in the project
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The project ID
 *     responses:
 *       200:
 *         description: Migration completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 citiesProcessed:
 *                   type: integer
 *       400:
 *         description: Bad Request - Invalid project ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 *       500:
 *         description: Internal server error during migration
 */
export const POST = apiHandler(async (req: NextRequest, { params }) => {
  const { projectId } = params;
  const body = await req.json();

  // Validate request parameters
  const validationResult = migrateSelectionsSchema.safeParse({
    projectId,
    year: body.year,
  });

  if (!validationResult.success) {
    const errors = validationResult.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
    throw new createHttpError.BadRequest(`Validation failed: ${errors}`);
  }

  const { projectId: validatedProjectId, year } = validationResult.data;

  // Verify project exists
  const project = await db.models.Project.findByPk(validatedProjectId);
  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  logger.info(`Starting HIAP selections migration for project: ${validatedProjectId}`);

  try {
    // Get count of cities before migration for response
    const citiesCount = await db.models.City.count({
      where: { projectId: validatedProjectId },
    });

    // Run the migration
    await migrateProjectActionSelections(validatedProjectId, year);

    logger.info(`Successfully completed HIAP selections migration for project: ${validatedProjectId}`);

    return NextResponse.json({
      message: "HIAP action selections migration completed successfully",
      citiesProcessed: citiesCount,
    });
  } catch (error) {
    logger.error(
      `Error during HIAP selections migration for project ${validatedProjectId}: ${error}`,
    );
    throw new createHttpError.InternalServerError(
      `Migration failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});
