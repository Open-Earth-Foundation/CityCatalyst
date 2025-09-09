import { db } from "@/models";
import { ModuleAccessService } from "./ModuleAccessService";
import type { ModuleAttributes } from "@/models/Module";

export class ModuleService {
  public static async getEnabledProjectModules(
    projectId: string,
  ): Promise<ModuleAttributes[]> {
    const projectModules = await db.models.ProjectModules.findAll({
      where: { projectId: projectId },
      include: [{ model: db.models.Module, as: "module" }],
    });

    // Filter out expired modules using the same logic as ModuleAccessService
    const enabledModules = [];
    for (const pm of projectModules) {
      const expiresOn = (pm as any).expiresOn || null;
      const isExpired = expiresOn && new Date() > new Date(expiresOn);
      
      if (!isExpired) {
        enabledModules.push((pm as any).module);
      }
    }

    return enabledModules;
  }

  public static async hasModuleAccess(
    projectId: string,
    moduleId: string,
  ): Promise<boolean> {
    return ModuleAccessService.hasModuleAccess(projectId, moduleId);
  }

  public static async getAllModules(): Promise<ModuleAttributes[]> {
    return db.models.Module.findAll();
  }

  /**
   * Get enabled modules for a city (via project)
   */
  public static async getEnabledCityModules(
    cityId: string,
  ): Promise<ModuleAttributes[]> {
    // Get city with project
    const city = await db.models.City.findByPk(cityId, {
      include: [{ model: db.models.Project, as: "project" }],
    });

    if (!city) {
      throw new Error(`City ${cityId} not found`);
    }

    return this.getEnabledProjectModules((city as any).project.projectId);
  }
}
