import createHttpError from 'http-errors';
import { logger } from '@/services/logger';

/**
 * Standardized permission error codes for resource-based permissions
 * Organized by resource type and operation for clarity
 */
export const PERMISSION_ERRORS = {
  // General permission errors
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  NO_ORGANIZATION_CONTEXT: 'NO_ORGANIZATION_CONTEXT',
  ORGANIZATION_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
  ORGANIZATION_INACTIVE: 'ORGANIZATION_INACTIVE',
  NO_ACCESS_TO_RESOURCE: 'NO_ACCESS_TO_RESOURCE',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  
  // Organization-level errors
  CANNOT_ACCESS_ORGANIZATION: 'CANNOT_ACCESS_ORGANIZATION',
  CANNOT_MANAGE_ORGANIZATION: 'CANNOT_MANAGE_ORGANIZATION',
  NOT_ORGANIZATION_ADMIN: 'NOT_ORGANIZATION_ADMIN',
  
  // Project-level errors  
  CANNOT_ACCESS_PROJECT: 'CANNOT_ACCESS_PROJECT',
  CANNOT_CREATE_CITY: 'CANNOT_CREATE_CITY',
  CANNOT_MANAGE_PROJECT: 'CANNOT_MANAGE_PROJECT',
  NOT_PROJECT_ADMIN: 'NOT_PROJECT_ADMIN',
  
  // City-level errors
  CANNOT_ACCESS_CITY: 'CANNOT_ACCESS_CITY',
  CANNOT_CREATE_INVENTORY: 'CANNOT_CREATE_INVENTORY',
  CANNOT_DELETE_CITY: 'CANNOT_DELETE_CITY',
  NOT_CITY_COLLABORATOR: 'NOT_CITY_COLLABORATOR',
  
  // Inventory-level errors
  CANNOT_ACCESS_INVENTORY: 'CANNOT_ACCESS_INVENTORY',
  CANNOT_EDIT_INVENTORY: 'CANNOT_EDIT_INVENTORY',
  CANNOT_DELETE_INVENTORY: 'CANNOT_DELETE_INVENTORY',
  
  // User management errors
  CANNOT_MANAGE_USERS: 'CANNOT_MANAGE_USERS',
  CANNOT_INVITE_USERS: 'CANNOT_INVITE_USERS',
  
  // Role-specific errors (for backwards compatibility and specific messaging)
  COLLABORATOR_ACCESS_RESTRICTED: 'COLLABORATOR_ACCESS_RESTRICTED',
  PROJECT_ADMIN_SCOPE_LIMITED: 'PROJECT_ADMIN_SCOPE_LIMITED',
} as const;

export type PermissionErrorCode = typeof PERMISSION_ERRORS[keyof typeof PERMISSION_ERRORS];

/**
 * Permission error messages for user-friendly display
 * Organized by resource type for easier maintenance
 */
export const PERMISSION_ERROR_MESSAGES: Record<PermissionErrorCode, string> = {
  // General permission errors
  [PERMISSION_ERRORS.INSUFFICIENT_PERMISSIONS]: 'You do not have sufficient permissions to perform this action',
  [PERMISSION_ERRORS.NO_ORGANIZATION_CONTEXT]: 'Unable to determine organization context for permission check',
  [PERMISSION_ERRORS.ORGANIZATION_NOT_FOUND]: 'Organization not found',
  [PERMISSION_ERRORS.ORGANIZATION_INACTIVE]: 'Organization is not active',
  [PERMISSION_ERRORS.NO_ACCESS_TO_RESOURCE]: 'You do not have access to this resource',
  [PERMISSION_ERRORS.RESOURCE_NOT_FOUND]: 'The requested resource was not found',
  
  // Organization-level errors
  [PERMISSION_ERRORS.CANNOT_ACCESS_ORGANIZATION]: 'You do not have access to this organization',
  [PERMISSION_ERRORS.CANNOT_MANAGE_ORGANIZATION]: 'You do not have permission to manage this organization',
  [PERMISSION_ERRORS.NOT_ORGANIZATION_ADMIN]: 'Organization administrator access required',
  
  // Project-level errors
  [PERMISSION_ERRORS.CANNOT_ACCESS_PROJECT]: 'You do not have access to this project',
  [PERMISSION_ERRORS.CANNOT_CREATE_CITY]: 'You do not have permission to create cities in this project',
  [PERMISSION_ERRORS.CANNOT_MANAGE_PROJECT]: 'You do not have permission to manage this project',
  [PERMISSION_ERRORS.NOT_PROJECT_ADMIN]: 'Project administrator access required',
  
  // City-level errors
  [PERMISSION_ERRORS.CANNOT_ACCESS_CITY]: 'You do not have access to this city',
  [PERMISSION_ERRORS.CANNOT_CREATE_INVENTORY]: 'You do not have permission to create inventories in this city',
  [PERMISSION_ERRORS.CANNOT_DELETE_CITY]: 'You do not have permission to delete this city',
  [PERMISSION_ERRORS.NOT_CITY_COLLABORATOR]: 'City collaborator access required',
  
  // Inventory-level errors
  [PERMISSION_ERRORS.CANNOT_ACCESS_INVENTORY]: 'You do not have access to this inventory',
  [PERMISSION_ERRORS.CANNOT_EDIT_INVENTORY]: 'You do not have permission to edit this inventory',
  [PERMISSION_ERRORS.CANNOT_DELETE_INVENTORY]: 'You do not have permission to delete this inventory',
  
  // User management errors
  [PERMISSION_ERRORS.CANNOT_MANAGE_USERS]: 'You do not have permission to manage users',
  [PERMISSION_ERRORS.CANNOT_INVITE_USERS]: 'You do not have permission to invite users',
  
  // Role-specific errors
  [PERMISSION_ERRORS.COLLABORATOR_ACCESS_RESTRICTED]: 'Collaborator access is limited to assigned cities only',
  [PERMISSION_ERRORS.PROJECT_ADMIN_SCOPE_LIMITED]: 'Project admin access is limited to assigned projects',
};

/**
 * Create a standardized permission error with code and message
 * Uses http-errors for proper error handling in Next.js API routes
 */
export function createPermissionError(
  code: PermissionErrorCode,
  statusCode: number = 403,
  additionalContext?: Record<string, any>
): createHttpError.HttpError {
  const message = PERMISSION_ERROR_MESSAGES[code];
  
  // Log the permission error with context
  logger.warn('Permission denied', {
    code,
    statusCode,
    message,
    ...additionalContext
  });
  
  // Create http-error that will be properly handled by Next.js
  const error = createHttpError(statusCode, message);
  (error as any).code = code;
  
  if (additionalContext) {
    (error as any).data = additionalContext;
  }
  
  return error;
}

/**
 * Helper functions for common permission error scenarios
 */
export const PermissionErrorHelpers = {
  /**
   * Create organization access error
   */
  organizationAccess: (organizationId?: string) => 
    createPermissionError(
      PERMISSION_ERRORS.CANNOT_ACCESS_ORGANIZATION,
      403,
      organizationId ? { organizationId } : undefined
    ),

  /**
   * Create project access error
   */
  projectAccess: (projectId?: string) => 
    createPermissionError(
      PERMISSION_ERRORS.CANNOT_ACCESS_PROJECT,
      403,
      projectId ? { projectId } : undefined
    ),

  /**
   * Create city access error
   */
  cityAccess: (cityId?: string) => 
    createPermissionError(
      PERMISSION_ERRORS.CANNOT_ACCESS_CITY,
      403,
      cityId ? { cityId } : undefined
    ),

  /**
   * Create inventory access error
   */
  inventoryAccess: (inventoryId?: string) => 
    createPermissionError(
      PERMISSION_ERRORS.CANNOT_ACCESS_INVENTORY,
      403,
      inventoryId ? { inventoryId } : undefined
    ),

  /**
   * Create role-based access error
   */
  roleRequired: (requiredRole: 'ORG_ADMIN' | 'PROJECT_ADMIN' | 'COLLABORATOR') => {
    const errorMap = {
      'ORG_ADMIN': PERMISSION_ERRORS.NOT_ORGANIZATION_ADMIN,
      'PROJECT_ADMIN': PERMISSION_ERRORS.NOT_PROJECT_ADMIN,
      'COLLABORATOR': PERMISSION_ERRORS.NOT_CITY_COLLABORATOR,
    };
    
    return createPermissionError(
      errorMap[requiredRole],
      403,
      { requiredRole }
    );
  },
};

/*
===============================================================================
MIGRATION NOTES:

This file has been updated to align with the new resource-based PermissionService:

1. ✅ Removed action-specific errors (EDIT_INVENTORY, etc.)
2. ✅ Added resource-level errors (CANNOT_ACCESS_INVENTORY, etc.)
3. ✅ Organized by resource hierarchy (Organization → Project → City → Inventory)
4. ✅ Added helper functions for common scenarios
5. ✅ Maintained backwards compatibility where needed

USAGE EXAMPLES:

// Resource access errors
throw PermissionErrorHelpers.inventoryAccess(inventoryId);
throw PermissionErrorHelpers.cityAccess(cityId);

// Role requirement errors
throw PermissionErrorHelpers.roleRequired('ORG_ADMIN');

// Custom errors
throw createPermissionError(PERMISSION_ERRORS.CANNOT_CREATE_CITY, 403, { projectId });
===============================================================================
*/