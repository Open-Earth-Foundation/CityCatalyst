import { db } from "@/models";
import { createPermissionError, PERMISSION_ERRORS } from "@/util/permission-errors";
import type { PermissionContext } from "./PermissionTypes";

/**
 * Handles organization context resolution from any resource context
 */
export class PermissionResolver {
  
  /**
   * Resolve organization ID from any context
   */
  static async resolveOrganizationId(context: PermissionContext): Promise<string | null> {
    if (context.organizationId) return context.organizationId;
    if (context.projectId) return this.getOrgFromProject(context.projectId);
    if (context.cityId) return this.getOrgFromCity(context.cityId);
    if (context.inventoryId) return this.getOrgFromInventory(context.inventoryId);
    return null;
  }

  /**
   * Get organization ID from project ID
   */
  private static async getOrgFromProject(projectId: string): Promise<string | null> {
    const project = await db.models.Project.findByPk(projectId, {
      attributes: ['organizationId']
    });
    return project?.organizationId || null;
  }

  /**
   * Get organization ID from city ID
   */
  private static async getOrgFromCity(cityId: string): Promise<string | null> {
    const city = await db.models.City.findByPk(cityId, {
      attributes: ['projectId'],
      include: [{
        model: db.models.Project,
        as: 'project',
        attributes: ['organizationId']
      }]
    });
    return city?.project?.organizationId || null;
  }

  /**
   * Get organization ID from inventory ID
   */
  private static async getOrgFromInventory(inventoryId: string): Promise<string | null> {
    const inventory = await db.models.Inventory.findByPk(inventoryId, {
      include: [{
        model: db.models.City,
        as: 'city',
        include: [{
          model: db.models.Project,
          as: 'project',
          attributes: ['organizationId']
        }]
      }]
    });
    return inventory?.city?.project?.organizationId || null;
  }

  /**
   * Ensure organization is active
   */
  static async ensureOrganizationActive(organizationId: string): Promise<void> {
    const org = await db.models.Organization.findByPk(organizationId, {
      attributes: ['active', 'name']
    });
    
    if (!org) {
      throw createPermissionError(PERMISSION_ERRORS.ORGANIZATION_NOT_FOUND, 404);
    }
    
    if (!org.active) {
      throw createPermissionError(PERMISSION_ERRORS.ORGANIZATION_INACTIVE);
    }
  }
}