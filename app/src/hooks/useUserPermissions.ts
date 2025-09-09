import { useGetUserPermissionsQuery } from "@/services/api";
import { UserRole } from "@/util/types";

interface UseUserPermissionsParams {
  organizationId?: string;
  projectId?: string;
  cityId?: string;
  inventoryId?: string;
  skip?: boolean;
}

/**
 * Hook to get user permissions for a given context
 * Returns the user's role and basic permission data
 */
export function useUserPermissions(params: UseUserPermissionsParams) {
  const { data, isLoading, error } = useGetUserPermissionsQuery(
    {
      organizationId: params.organizationId,
      projectId: params.projectId,
      cityId: params.cityId,
      inventoryId: params.inventoryId,
    },
    { skip: params.skip },
  );

  const userRole = data?.userRole || UserRole.NO_ACCESS;
  const hasAccess = data?.hasAccess || false;

  // Helper to get role display name
  const getRoleDisplayName = (role: UserRole): string => {
    const roleNames = {
      [UserRole.ORG_ADMIN]: "Organization Administrator",
      [UserRole.PROJECT_ADMIN]: "Project Administrator",
      [UserRole.COLLABORATOR]: "Collaborator",
      [UserRole.PUBLIC_READER]: "Public Reader",
      [UserRole.NO_ACCESS]: "No Access",
    };
    return roleNames[role];
  };

  return {
    // Raw API data
    data,
    isLoading,
    error,

    // Derived values
    userRole,
    hasAccess,
    organizationId: data?.organizationId || null,
    context: data?.context,
    roleDisplayName: getRoleDisplayName(userRole),
  };
}
