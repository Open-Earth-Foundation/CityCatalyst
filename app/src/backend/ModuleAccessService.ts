import { db } from "@/models";
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

    // Check if the module access has expired
    let isExpired = false;
    let expiresOn: Date | null = null;

    if (hasAccess && projectModule) {
      expiresOn = projectModule.expiresOn || null;
      if (expiresOn) {
        isExpired = new Date() > new Date(expiresOn);
      }
    }

    const result = hasAccess && !isExpired;

    logger.info(
      `Module access check completed for project ${projectId} and module ${moduleId}`,
      {
        hasAccess,
        isExpired,
        expiresOn,
        result,
      },
    );

    return result;
  }
}
