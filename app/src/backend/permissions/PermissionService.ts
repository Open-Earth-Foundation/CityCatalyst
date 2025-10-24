import type { AppSession } from "@/lib/auth";
import {
  createPermissionError,
  PERMISSION_ERRORS,
} from "@/util/permission-errors";
import createHttpError from "http-errors";
import { Roles } from "@/util/types";
import { logger } from "@/services/logger";
import { db } from "@/models";

import {
  UserRole,
  PermissionContext,
  ResourceAccess,
  PermissionOptions,
} from "./PermissionTypes";
import { PermissionResolver } from "./PermissionResolver";
import { RoleChecker } from "./RoleChecker";
import { ResourceLoader } from "./ResourceLoader";

export type { UserRole, PermissionContext, ResourceAccess, PermissionOptions };

/*
==================================================================
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

/**
 * Core Principle: Higher roles inherit all permissions of lower roles
 * - ORG_ADMIN: Can do anything within their organization
 * - PROJECT_ADMIN: Can do anything within their projects (except org management)
 * - COLLABORATOR: Can do anything within their assigned cities (except creation/deletion)
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
    options: PermissionOptions = {},
  ): Promise<ResourceAccess> {
    // Check for public inventory access first, regardless of authentication
    if (context.inventoryId) {
      logger.debug(
        { inventoryId: context.inventoryId },
        "Checking public inventory access",
      );

      // Load inventory to check if it's public
      const inventory = await db.models.Inventory.findByPk(context.inventoryId);

      if (inventory?.isPublic) {
        logger.debug(
          { inventoryId: context.inventoryId },
          "Public inventory access granted",
        );

        const shouldLoadResource = options.excludeResource
          ? false
          : options.includeResource !== false;
        const resource = shouldLoadResource
          ? await ResourceLoader.getResource(context)
          : undefined;

        return {
          hasAccess: true,
          userRole: UserRole.PUBLIC_READER,
          organizationId:
            (await PermissionResolver.resolveOrganizationId(context)) ||
            "public",
          resource,
        };
      }
    }

    if (!session?.user) {
      logger.warn(
        { context },
        "Permission check failed: No authenticated session",
      );
      throw new createHttpError.Unauthorized("Authentication required");
    }

    logger.debug(
      { userId: session.user.id, context, options },
      "Permission check initiated",
    );

    // Default includeResource to true unless explicitly excluded
    const shouldLoadResource = options.excludeResource
      ? false
      : options.includeResource !== false;

    // System admins bypass all checks
    if (session.user.role === Roles.Admin) {
      logger.debug({ userId: session.user.id }, "System admin access granted");
      const resource = shouldLoadResource
        ? await ResourceLoader.getResource(context)
        : undefined;
      return {
        hasAccess: true,
        userRole: UserRole.ORG_ADMIN,
        organizationId:
          (await PermissionResolver.resolveOrganizationId(context)) || "system",
        resource,
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
    options: PermissionOptions = {},
  ): Promise<ResourceAccess> {
    // Resolve organization context
    const orgId = await PermissionResolver.resolveOrganizationId(context);
    if (!orgId) {
      // If we can't resolve organization context, the resource likely doesn't exist
      // Return 404 instead of 403 to allow proper API error handling
      throw createPermissionError(PERMISSION_ERRORS.RESOURCE_NOT_FOUND, 404);
    }

    // Check organization status if required
    if (options.requireActive) {
      await PermissionResolver.ensureOrganizationActive(orgId);
    }

    // Get user's role in this organization
    const userRole = await RoleChecker.getUserRoleInOrganization(
      userId,
      orgId,
      context,
    );

    if (userRole === UserRole.NO_ACCESS) {
      logger.warn(
        {
          userId,
          organizationId: orgId,
          context,
        },
        "User has no access to resource",
      );
      throw createPermissionError(
        PERMISSION_ERRORS.NO_ACCESS_TO_RESOURCE,
        403,
        {
          userId,
          organizationId: orgId,
          context,
        },
      );
    }

    logger.debug(
      { userId, userRole, organizationId: orgId },
      "Permission check successful",
    );

    // Default includeResource to true unless explicitly excluded
    const shouldLoadResource = options.excludeResource
      ? false
      : options.includeResource !== false;

    // Load resource if requested
    const resource = shouldLoadResource
      ? await ResourceLoader.getResource(context)
      : undefined;

    return {
      hasAccess: true,
      userRole,
      organizationId: orgId,
      resource,
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
    options: PermissionOptions = {},
  ): Promise<ResourceAccess> {
    const access = await this.checkAccess(session, { organizationId }, options);

    if (access.userRole !== UserRole.ORG_ADMIN) {
      logger.warn(
        { organizationId, userRole: access.userRole },
        "Organization access denied: Not an org admin",
      );
      throw createPermissionError(
        PERMISSION_ERRORS.CANNOT_ACCESS_ORGANIZATION,
        403,
        {
          organizationId,
          requiredRole: UserRole.ORG_ADMIN,
          actualRole: access.userRole,
        },
      );
    }

    return access;
  }

  /**
   * ORG_ADMINs and PROJECT_ADMINs can access projects
   */
  static async canAccessProject(
    session: AppSession | null,
    projectId: string,
    options: PermissionOptions = {},
  ): Promise<ResourceAccess> {
    const access = await this.checkAccess(session, { projectId }, options);

    if (
      ![UserRole.ORG_ADMIN, UserRole.PROJECT_ADMIN].includes(access.userRole)
    ) {
      logger.warn(
        { projectId, userRole: access.userRole },
        "Project access denied: Insufficient role",
      );
      throw createPermissionError(
        PERMISSION_ERRORS.CANNOT_ACCESS_PROJECT,
        403,
        {
          projectId,
          requiredRoles: [UserRole.ORG_ADMIN, UserRole.PROJECT_ADMIN],
          actualRole: access.userRole,
        },
      );
    }

    return access;
  }

  /**
   * Only ORG_ADMINs and PROJECT_ADMINs can create cities
   */
  static async canCreateCity(
    session: AppSession | null,
    projectId: string,
  ): Promise<ResourceAccess> {
    const access = await this.canAccessProject(session, projectId, {
      requireActive: true,
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
    options: PermissionOptions = {},
  ): Promise<ResourceAccess> {
    return this.checkAccess(session, { cityId }, options);
  }

  /**
   * Only ORG_ADMINs and PROJECT_ADMINs can create inventories
   */
  static async canCreateInventory(
    session: AppSession | null,
    cityId: string,
  ): Promise<ResourceAccess> {
    const access = await this.checkAccess(session, { cityId });

    if (
      ![UserRole.ORG_ADMIN, UserRole.PROJECT_ADMIN].includes(access.userRole)
    ) {
      logger.warn(
        {
          cityId,
          userRole: access.userRole,
        },
        "Create inventory denied: Insufficient role",
      );
      throw createPermissionError(
        PERMISSION_ERRORS.CANNOT_CREATE_INVENTORY,
        403,
        {
          cityId,
          requiredRoles: [UserRole.ORG_ADMIN, UserRole.PROJECT_ADMIN],
          actualRole: access.userRole,
        },
      );
    }

    return access;
  }

  /**
   * Only ORG_ADMINs can delete cities
   */
  static async canDeleteCity(
    session: AppSession | null,
    cityId: string,
  ): Promise<ResourceAccess> {
    const access = await this.checkAccess(session, { cityId });

    if (access.userRole !== UserRole.ORG_ADMIN) {
      logger.warn(
        { cityId, userRole: access.userRole },
        "Delete city denied: Not an org admin",
      );
      throw createPermissionError(PERMISSION_ERRORS.CANNOT_DELETE_CITY, 403, {
        cityId,
        requiredRole: UserRole.ORG_ADMIN,
        actualRole: access.userRole,
      });
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
    options: PermissionOptions = {},
  ): Promise<ResourceAccess> {
    return this.checkAccess(session, { inventoryId }, options);
  }

  /**
   * All roles can edit inventories they have access to
   */
  static async canEditInventory(
    session: AppSession | null,
    inventoryId: string,
  ): Promise<ResourceAccess> {
    return this.canAccessInventory(session, inventoryId);
  }

  /**
   * Only ORG_ADMINs can delete inventories
   */
  static async canDeleteInventory(
    session: AppSession | null,
    inventoryId: string,
  ): Promise<ResourceAccess> {
    const access = await this.checkAccess(session, { inventoryId });

    if (access.userRole !== UserRole.ORG_ADMIN) {
      logger.warn(
        {
          inventoryId,
          userRole: access.userRole,
        },
        "Delete inventory denied: Not an org admin",
      );
      throw createPermissionError(
        PERMISSION_ERRORS.CANNOT_DELETE_INVENTORY,
        403,
        {
          inventoryId,
          requiredRole: UserRole.ORG_ADMIN,
          actualRole: access.userRole,
        },
      );
    }

    return access;
  }
}
