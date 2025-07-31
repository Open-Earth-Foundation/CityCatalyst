import { ModuleAccessService } from "@/backend/ModuleAccessService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { db } from "@/models";
import UserService from "@/backend/UserService";
import createHttpError from "http-errors";
import { z } from "zod";

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
