import type { AppSession } from "@/lib/auth";

import { UserRole } from '@/util/types';

export type { UserRole };

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
  includeResource?: boolean;  // Defaults to true
  excludeResource?: boolean;  // Explicitly exclude resource loading
  allowPublicRead?: boolean;
}

export interface PermissionChecker {
  checkAccess(
    session: AppSession | null,
    context: PermissionContext,
    options?: PermissionOptions
  ): Promise<ResourceAccess>;
}