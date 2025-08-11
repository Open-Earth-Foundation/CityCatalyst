import { db } from "@/models";
import { hasOrgOwnerLevelAccess, hasProjectOwnerLevelAccess } from "@/backend/RoleBasedAccessService";
import { UserRole, type PermissionContext } from "./PermissionTypes";

/**
 * Handles role checking and hierarchy logic
 */
export class RoleChecker {
  
  /**
   * Get user's role in organization with context awareness
   */
  static async getUserRoleInOrganization(
    userId: string, 
    organizationId: string,
    context: PermissionContext = {}
  ): Promise<UserRole> {
    // Check org admin first (highest priority)
    const isOrgAdmin = await hasOrgOwnerLevelAccess(organizationId, userId);
    if (isOrgAdmin) return UserRole.ORG_ADMIN;

    // Check project admin (with context if available for performance)
    const isProjectAdmin = context.projectId
      ? await hasProjectOwnerLevelAccess(context.projectId, userId)
      : await this.isProjectAdminInOrg(userId, organizationId);
    if (isProjectAdmin) return UserRole.PROJECT_ADMIN;

    // Check collaborator (with context if available for performance)
    const isCollaborator = context.cityId
      ? await this.hasAccessToCity(context.cityId, userId)
      : await this.isCollaboratorInOrg(userId, organizationId);
    if (isCollaborator) return UserRole.COLLABORATOR;

    return UserRole.NO_ACCESS;
  }

  /**
   * Check if user is project admin in any project within this organization
   */
  private static async isProjectAdminInOrg(userId: string, organizationId: string): Promise<boolean> {
    const projectAdmin = await db.models.ProjectAdmin.findOne({
      where: { userId },
      include: [{
        model: db.models.Project,
        as: 'project',
        where: { organizationId },
        attributes: ['projectId']
      }]
    });
    return !!projectAdmin;
  }

  /**
   * Check if user is a collaborator in any city within this organization
   */
  private static async isCollaboratorInOrg(userId: string, organizationId: string): Promise<boolean> {
    const collaborator = await db.models.CityUser.findOne({
      where: { userId },
      include: [{
        model: db.models.City,
        as: 'city',
        include: [{
          model: db.models.Project,
          as: 'project',
          where: { organizationId },
          attributes: ['projectId']
        }]
      }]
    });
    return !!collaborator;
  }

  /**
   * Check if user has access to specific city
   */
  private static async hasAccessToCity(cityId: string, userId: string): Promise<boolean> {
    const cityUser = await db.models.CityUser.findOne({
      where: { cityId, userId }
    });
    return !!cityUser;
  }
}