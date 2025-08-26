import type { AppSession } from "@/lib/auth";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { Organization } from "@/models/Organization";
import { Project } from "@/models/Project";

import { UserRole } from "@/util/types";

export { UserRole };

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
  resource?: Organization | Project | City | Inventory;
}

export interface PermissionOptions {
  requireActive?: boolean;
  includeResource?: boolean; // Defaults to true
  excludeResource?: boolean; // Explicitly exclude resource loading
  allowPublicRead?: boolean;
}

export interface PermissionChecker {
  checkAccess(
    session: AppSession | null,
    context: PermissionContext,
    options?: PermissionOptions,
  ): Promise<ResourceAccess>;
}
