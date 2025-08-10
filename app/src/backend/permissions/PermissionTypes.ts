import type { AppSession } from "@/lib/auth";

export type UserRole = 'ORG_ADMIN' | 'PROJECT_ADMIN' | 'COLLABORATOR' | 'NO_ACCESS';

export interface PermissionContext {
  organizationId?: string;
  projectId?: string;
  cityId?: string;
  inventoryId?: string;
}

export interface ResourceAccess {
  hasAccess: boolean;
  userRole: UserRole;
  organizationId: string;
  resource?: any;
}

export interface PermissionOptions {
  requireActive?: boolean;
  includeResource?: boolean;
  allowPublicRead?: boolean;
}

export interface PermissionChecker {
  checkAccess(
    session: AppSession | null,
    context: PermissionContext,
    options?: PermissionOptions
  ): Promise<ResourceAccess>;
}