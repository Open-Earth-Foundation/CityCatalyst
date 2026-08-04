import { useGetOrganizationForInventoryQuery } from "@/services/api";
import {
  useOrganizationContext,
  hasOrganizationChanged,
  normalizeOrganizationState,
} from "@/hooks/organization-context-provider/use-organizational-context";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import type { OrganizationWithThemeResponse } from "@/util/types";

export function useInventoryOrganization(
  inventoryId: string,
  preFetchedOrgData?: OrganizationWithThemeResponse,
) {
  const { data: inventoryOrgData, isLoading: isInventoryOrgDataLoading } =
    useGetOrganizationForInventoryQuery(inventoryId, {
      skip: !inventoryId || !!preFetchedOrgData, // Skip if pre-fetched data is available
    });

  // Use pre-fetched data if available, otherwise use fetched data
  const orgData = preFetchedOrgData || inventoryOrgData;

  const { organization, setOrganization } = useOrganizationContext();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!orgData) return;

    const newOrgState = normalizeOrganizationState(orgData);

    if (hasOrganizationChanged(organization, newOrgState)) {
      setOrganization(newOrgState);
    }
    if (orgData.theme?.themeKey) {
      setTheme(orgData.theme.themeKey as string);
    }
  }, [
    isInventoryOrgDataLoading,
    orgData,
    organization,
    setOrganization,
    setTheme,
  ]);

  return {
    inventoryOrgData,
    isInventoryOrgDataLoading,
  };
}
