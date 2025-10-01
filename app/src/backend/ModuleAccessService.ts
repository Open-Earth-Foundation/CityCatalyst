import { db } from "@/models";
import type { ProjectModulesAttributes } from "@/models/ProjectModules";
import { logger } from "@/services/logger";

export class ModuleAccessService {
  public static async hasModuleAccess(
    projectId: string,
    moduleId: string,
  ): Promise<boolean> {
    logger.info(
      `Checking module access for project ${projectId} and module ${moduleId}`,
    );

    // Check if the project has access to the module
    const projectModule = await db.models.ProjectModules.findOne({
      where: {
        projectId: projectId,
        moduleId: moduleId,
      },
    });

    const hasAccess = !!projectModule;
    const expiresOn = projectModule?.expiresOn || null;
    const isExpired = expiresOn && new Date() > new Date(expiresOn);
    const result = hasAccess && !isExpired;

    logger.info(
      {
        hasAccess,
        isExpired,
        expiresOn,
        result,
        projectId,
        moduleId,
      },
      `Module access check completed`,
    );

    return result;
  }

  public static async enableModuleAccess(
    projectId: string,
    moduleId: string,
  ): Promise<ProjectModulesAttributes> {
    logger.info(
      `Enabling module access for project ${projectId} and module ${moduleId}`,
    );

    const projectModule = await db.models.ProjectModules.create({
      projectId: projectId,
      moduleId: moduleId,
    });

    logger.info(
      `Module access enabled for project ${projectId} and module ${moduleId}`,
    );

    return projectModule;
  }

  public static async disableModuleAccess(
    projectId: string,
    moduleId: string,
  ): Promise<void> {
    logger.info(
      `Disabling module access for project ${projectId} and module ${moduleId}`,
    );

    await db.models.ProjectModules.destroy({
      where: { projectId: projectId, moduleId: moduleId },
    });

    logger.info(
      `Module access disabled for project ${projectId} and module ${moduleId}`,
    );

    return;
  }
}
