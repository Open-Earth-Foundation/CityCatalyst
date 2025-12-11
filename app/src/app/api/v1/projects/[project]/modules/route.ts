/**
 * @swagger
 * /api/v1/projects/{project}/modules:
 *   get:
 *     tags:
 *       - project
 *       - modules
 *     operationId: getProjectModules
 *     summary: List modules enabled for a specific project
 *     description: Retrieves all modules that have been enabled for the specified project. Returns a list of module objects with their localized metadata and configuration details. Requires authentication to access project module information.
 *     parameters:
 *       - in: path
 *         name: project
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Project ID for which to retrieve enabled modules
 *     responses:
 *       200:
 *         description: List of modules enabled for the project.
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
 *                       id:
 *                         type: string
 *                         format: uuid
 *                         description: Unique identifier for the module
 *                       stage:
 *                         type: string
 *                         description: Module development stage
 *                       name:
 *                         type: object
 *                         additionalProperties:
 *                           type: string
 *                         description: Localized module names by language code
 *                       description:
 *                         type: object
 *                         additionalProperties:
 *                           type: string
 *                         description: Localized module descriptions by language code
 *                       tagline:
 *                         type: object
 *                         additionalProperties:
 *                           type: string
 *                         description: Localized module taglines by language code
 *                       type:
 *                         type: string
 *                         description: Module type classification
 *                       author:
 *                         type: string
 *                         description: Module author or maintainer
 *                       url:
 *                         type: string
 *                         description: Module documentation or source URL
 *                       created:
 *                         type: string
 *                         format: date-time
 *                         description: Module creation timestamp
 *                       last_updated:
 *                         type: string
 *                         format: date-time
 *                         description: Module last update timestamp
 *                   description: Array of module objects with localized metadata
 *       401:
 *         description: Unauthorized - user lacks access to the project.
 *       404:
 *         description: Project not found.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({
  project: z.string().uuid("Project ID must be a valid UUID"),
});

export const GET = apiHandler(async (_req: Request, context) => {
  const { project: projectId } = paramsSchema.parse(context.params);
  const projectModules = await db.models.ProjectModules.findAll({
    where: { projectId: projectId },
    include: [{ model: db.models.Module, as: "module" }],
  });
  const modules = projectModules.map((pm: any) => pm.module);
  return NextResponse.json({ data: modules });
});
