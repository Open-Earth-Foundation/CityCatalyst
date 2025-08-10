import type { AppSession } from "@/lib/auth";
import { createPermissionError, PERMISSION_ERRORS } from "@/util/permission-errors";
import createHttpError from "http-errors";
import { Roles } from "@/util/types";

import type { 
  UserRole, 
  PermissionContext, 
  ResourceAccess, 
  PermissionOptions 
} from "./PermissionTypes";
import { PermissionResolver } from "./PermissionResolver";
import { RoleChecker } from "./RoleChecker";
import { ResourceLoader } from "./ResourceLoader";

export type { UserRole, PermissionContext, ResourceAccess, PermissionOptions };

/**
 * Core Principle: Higher roles inherit all permissions of lower roles
 * - ORG_ADMIN: Can do anything within their organization
 * - PROJECT_ADMIN: Can do anything within their projects (except org management)
 * - COLLABORATOR: Can do anything within their assigned cities (except creation/deletion)
 * 
 * This class delegates to specialized modules for:
 * - Context resolution (PermissionResolver)
 * - Role checking (RoleChecker)  
 * - Resource loading (ResourceLoader)
 */
export class PermissionService {
  
  // =============================================================================
  // CORE PERMISSION CHECKING
  // =============================================================================
  
  /**
   * Main permission check with session
   */
  static async checkAccess(
    session: AppSession | null,
    context: PermissionContext,
    options: PermissionOptions = {}
  ): Promise<ResourceAccess> {
    if (!session?.user) {
      throw new createHttpError.Unauthorized("Authentication required");
    }

    // Default includeResource to true unless explicitly excluded
    const shouldLoadResource = options.excludeResource ? false : (options.includeResource !== false);

    // System admins bypass all checks
    if (session.user.role === Roles.Admin) {
      const resource = shouldLoadResource 
        ? await ResourceLoader.getResource(context) 
        : undefined;
      return {
        hasAccess: true,
        userRole: 'ORG_ADMIN',
        organizationId: await PermissionResolver.resolveOrganizationId(context) || 'system',
        resource
      };
    }

    return this.checkUserAccess(session.user.id, context, options);
  }

  /**
   * Core user permission check
   */
  static async checkUserAccess(
    userId: string,
    context: PermissionContext,
    options: PermissionOptions = {}
  ): Promise<ResourceAccess> {
    // Resolve organization context
    const orgId = await PermissionResolver.resolveOrganizationId(context);
    if (!orgId) {
      throw createPermissionError(PERMISSION_ERRORS.NO_ORGANIZATION_CONTEXT);
    }

    // Check organization status if required
    if (options.requireActive) {
      await PermissionResolver.ensureOrganizationActive(orgId);
    }

    // Get user's role in this organization
    const userRole = await RoleChecker.getUserRoleInOrganization(userId, orgId, context);
    
    if (userRole === 'NO_ACCESS') {
      throw createPermissionError(PERMISSION_ERRORS.NO_ACCESS_TO_RESOURCE);
    }

    // Default includeResource to true unless explicitly excluded
    const shouldLoadResource = options.excludeResource ? false : (options.includeResource !== false);
    
    // Load resource if requested
    const resource = shouldLoadResource 
      ? await ResourceLoader.getResource(context) 
      : undefined;
    
    return {
      hasAccess: true,
      userRole,
      organizationId: orgId,
      resource
    };
  }

  // =============================================================================
  // ORGANIZATION LEVEL PERMISSIONS
  // =============================================================================

  /**
   * Can user access organization-level resources?
   * Only ORG_ADMINs can access org-level resources
   */
  static async canAccessOrganization(
    session: AppSession | null,
    organizationId: string,
    options: PermissionOptions = {}
  ): Promise<ResourceAccess> {
    const access = await this.checkAccess(session, { organizationId }, options);
    
    if (access.userRole !== 'ORG_ADMIN') {
      throw createPermissionError(PERMISSION_ERRORS.CANNOT_ACCESS_ORGANIZATION);
    }
    
    return access;
  }

  /**
   * ORG_ADMINs and PROJECT_ADMINs can access projects
   */
  static async canAccessProject(
    session: AppSession | null,
    projectId: string,
    options: PermissionOptions = {}
  ): Promise<ResourceAccess> {
    const access = await this.checkAccess(session, { projectId }, options);
    
    if (!['ORG_ADMIN', 'PROJECT_ADMIN'].includes(access.userRole)) {
      throw createPermissionError(PERMISSION_ERRORS.CANNOT_ACCESS_PROJECT);
    }
    
    return access;
  }

  /**
   * Only ORG_ADMINs and PROJECT_ADMINs can create cities
   */
  static async canCreateCity(
    session: AppSession | null,
    projectId: string
  ): Promise<ResourceAccess> {
    const access = await this.canAccessProject(session, projectId, { 
      requireActive: true
    });
    return access;
  }

  // =============================================================================
  // CITY LEVEL PERMISSIONS
  // =============================================================================

  /**
   * All roles can access cities (with scope restrictions)
   */
  static async canAccessCity(
    session: AppSession | null,
    cityId: string,
    options: PermissionOptions = {}
  ): Promise<ResourceAccess> {
    return this.checkAccess(session, { cityId }, options);
  }

  /**
   * Only ORG_ADMINs and PROJECT_ADMINs can create inventories
   */
  static async canCreateInventory(
    session: AppSession | null,
    cityId: string
  ): Promise<ResourceAccess> {
    const access = await this.checkAccess(session, { cityId });
    
    if (!['ORG_ADMIN', 'PROJECT_ADMIN'].includes(access.userRole)) {
      throw createPermissionError(PERMISSION_ERRORS.CANNOT_CREATE_INVENTORY);
    }
    
    return access;
  }

  /**
   * Only ORG_ADMINs can delete cities
   */
  static async canDeleteCity(
    session: AppSession | null,
    cityId: string
  ): Promise<ResourceAccess> {
    const access = await this.checkAccess(session, { cityId });
    
    if (access.userRole !== 'ORG_ADMIN') {
      throw createPermissionError(PERMISSION_ERRORS.CANNOT_DELETE_CITY);
    }
    
    return access;
  }

  // =============================================================================
  // INVENTORY LEVEL PERMISSIONS
  // =============================================================================

  /**
   * All roles can access inventories (with scope restrictions)
   */
  static async canAccessInventory(
    session: AppSession | null,
    inventoryId: string,
    options: PermissionOptions = {}
  ): Promise<ResourceAccess> {
    return this.checkAccess(session, { inventoryId }, options);
  }

  /**
   * All roles can edit inventories they have access to
   */
  static async canEditInventory(
    session: AppSession | null,
    inventoryId: string
  ): Promise<ResourceAccess> {
    return this.canAccessInventory(session, inventoryId);
  }

  /**
   * Only ORG_ADMINs can delete inventories
   */
  static async canDeleteInventory(
    session: AppSession | null,
    inventoryId: string
  ): Promise<ResourceAccess> {
    const access = await this.checkAccess(session, { inventoryId });
    
    if (access.userRole !== 'ORG_ADMIN') {
      throw createPermissionError(PERMISSION_ERRORS.CANNOT_DELETE_INVENTORY);
    }
    
    return access;
  }
}

/*
================================================================================
HOW TO USE:

await PermissionService.canAccessInventory(session, inventoryId);
await PermissionService.canCreateCity(session, projectId);
await PermissionService.canAccessOrganization(session, organizationId);

HOW TO EXTEND:
- New resources: Add methods to PermissionService + update modules
- New operations: Add can{Operation}{Resource} methods
- New role logic: Extend RoleChecker.getUserRoleInOrganization
================================================================================
*/