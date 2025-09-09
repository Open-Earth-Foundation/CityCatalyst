import { db } from "@/models";
import type { PermissionContext } from "./PermissionTypes";

/**
 * Handles loading resources based on permission context
 */
export class ResourceLoader {
  
  /**
   * Get resource based on context with appropriate includes
   */
  static async getResource(context: PermissionContext): Promise<any> {
    if (context.inventoryId) {
      return this.getInventoryWithFullContext(context.inventoryId);
    }
    
    if (context.cityId) {
      return this.getCityWithContext(context.cityId);
    }
    
    if (context.projectId) {
      return this.getProjectWithContext(context.projectId);
    }
    
    if (context.organizationId) {
      return this.getOrganization(context.organizationId);
    }
    
    return null;
  }

  /**
   * Load inventory with full hierarchy context
   */
  private static async getInventoryWithFullContext(inventoryId: string) {
    return db.models.Inventory.findByPk(inventoryId, {
      include: [{
        model: db.models.City,
        as: 'city',
        include: [{
          model: db.models.Project,
          as: 'project',
          include: [{
            model: db.models.Organization,
            as: 'organization'
          }]
        }]
      }]
    });
  }

  /**
   * Load city with project and organization context
   */
  private static async getCityWithContext(cityId: string) {
    return db.models.City.findByPk(cityId, {
      include: [{
        model: db.models.Project,
        as: 'project',
        include: [{
          model: db.models.Organization,
          as: 'organization'
        }]
      }]
    });
  }

  /**
   * Load project with organization and cities
   */
  private static async getProjectWithContext(projectId: string) {
    return db.models.Project.findByPk(projectId, {
      include: [{
        model: db.models.Organization,
        as: 'organization'
      }, {
        model: db.models.City,
        as: 'cities'
      }]
    });
  }

  /**
   * Load organization
   */
  private static async getOrganization(organizationId: string) {
    return db.models.Organization.findByPk(organizationId);
  }
}