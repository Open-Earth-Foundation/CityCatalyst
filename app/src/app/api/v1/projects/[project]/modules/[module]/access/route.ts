/**
 * @swagger
 * /api/v1/projects/{project}/modules/{module}/access:
 *   get:
 *     tags:
 *       - Project Modules
 *     summary: Check if a project has access to a module
 *     parameters:
 *       - in: path
 *         name: project
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: module
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Access flag returned.
 *       403:
 *         description: Access denied.
 *       404:
 *         description: Project not found.
 */
import { ModuleAccessService } from "@/backend/ModuleAccessService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { db } from "@/models";
import UserService from "@/backend/UserService";
import createHttpError from "http-errors";
import { z } from "zod";
import { ProjectModulesAttributes } from "@/models/ProjectModules";

const paramsSchema = z.object({
  project: z.string().uuid("Project ID must be a valid UUID"),
  module: z.string().uuid("Module ID must be a valid UUID"),
});

export const GET = apiHandler(async (_req: Request, context) => {
  const { project: projectId, module: moduleId } = paramsSchema.parse(
    context.params,
  );
  const { session } = context;

  if (!moduleId) {
    throw new createHttpError.BadRequest("ModuleId is missing");
  }

  // Find the project to get its organization
  const project = await db.models.Project.findByPk(projectId);
  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  // Validate that the user has access to this project
  // They must be either an admin or have access to the organization/project
  try {
    UserService.validateIsAdminOrOrgAdmin(session, project.organizationId);
  } catch (error) {
    // If they're not an admin or org admin, check if they have access to the project
    if (session) {
      // Check if they're a project admin
      const projectAdmin = await db.models.ProjectAdmin.findOne({
        where: {
          userId: session.user.id,
          projectId: projectId,
        },
      });

      if (!projectAdmin) {
        // Check if they have access to any city within this project
        const cityUser = await db.models.CityUser.findOne({
          where: {
            userId: session.user.id,
          },
          include: [
            {
              model: db.models.City,
              as: "city",
              where: { projectId: projectId },
            },
          ],
        });

        if (!cityUser) {
          throw new createHttpError.Forbidden("Access denied");
        }
      }
    } else {
      throw new createHttpError.Forbidden("Access denied");
    }
  }

  const hasAccess = await ModuleAccessService.hasModuleAccess(
    projectId,
    moduleId,
  );

  return NextResponse.json({
    data: hasAccess,
  });
});

/**
 * @swagger
 * /api/v1/projects/{project}/modules/{module}/access:
 *   post:
 *     tags:
 *       - Project Modules
 *     summary: Enable module access for a project (admin only).
 *     description: Grants a project access to a specific module. Requires admin or organization admin privileges. Returns the created project-module relationship.
 *     parameters:
 *       - in: path
 *         name: project
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: module
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Module access enabled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   description: Created project-module relationship
 *       400:
 *         description: ModuleId is missing.
 *       403:
 *         description: Access denied - user lacks admin privileges.
 *       404:
 *         description: Project not found.
 *       500:
 *         description: Failed to enable module access.
 */
// enable admin to grant project access to the module
export const POST = apiHandler(async (_req: Request, context) => {
  const { project: projectId, module: moduleId } = paramsSchema.parse(
    context.params,
  );
  const { session } = context;

  if (!moduleId) {
    throw new createHttpError.BadRequest("ModuleId is missing");
  }

  // Find the project to get its organization
  const project = await db.models.Project.findByPk(projectId);
  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  // Validate that the user has access to this project
  // They must be either an admin or have access to the organization/project
  try {
    UserService.validateIsAdminOrOrgAdmin(session, project.organizationId);
  } catch (error) {
    throw new createHttpError.Forbidden("Access denied");
  }
  let projectModule;

  try {
    projectModule = await ModuleAccessService.enableModuleAccess(
      projectId,
      moduleId,
    );
  } catch (error) {
    throw new createHttpError.InternalServerError(
      "Failed to enable module access",
    );
  }

  return NextResponse.json({
    data: projectModule,
  });
});

/**
 * @swagger
 * /api/v1/projects/{project}/modules/{module}/access:
 *   delete:
 *     tags:
 *       - Project Modules
 *     summary: Disable module access for a project (admin only).
 *     description: Revokes a project's access to a specific module. Requires admin or organization admin privileges. Returns the updated project-module relationship.
 *     parameters:
 *       - in: path
 *         name: project
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: module
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Module access disabled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   description: Updated project-module relationship
 *       400:
 *         description: ModuleId is missing.
 *       403:
 *         description: Access denied - user lacks admin privileges.
 *       404:
 *         description: Project not found.
 *       500:
 *         description: Failed to disable module access.
 */
// disable admin to revoke project access to the module
export const DELETE = apiHandler(async (_req: Request, context) => {
  const { project: projectId, module: moduleId } = paramsSchema.parse(
    context.params,
  );
  const { session } = context;
  if (!moduleId) {
    throw new createHttpError.BadRequest("ModuleId is missing");
  }

  // Find the project to get its organization
  const project = await db.models.Project.findByPk(projectId);
  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }
  try {
    UserService.validateIsAdminOrOrgAdmin(session, project.organizationId);
  } catch (error) {
    throw new createHttpError.Forbidden("Access denied");
  }

  let projectModule;

  try {
    projectModule = await ModuleAccessService.disableModuleAccess(
      projectId,
      moduleId,
    );
  } catch (error) {
    throw new createHttpError.InternalServerError(
      "Failed to disable module access",
    );
  }

  return NextResponse.json({
    data: projectModule,
  });
});
