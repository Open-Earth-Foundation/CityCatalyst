import { useGetOrganizationForInventoryQuery } from "@/services/api";
import {
  useOrganizationContext,
  hasOrganizationChanged,
  normalizeOrganizationState,
} from "@/hooks/organization-context-provider/use-organizational-context";
import { useTheme } from "next-themes";
import { useEffect } from "react";

export function useInventoryOrganization(inventoryId: string) {
  const { data: inventoryOrgData, isLoading: isInventoryOrgDataLoading } =
    useGetOrganizationForInventoryQuery(inventoryId, {
      skip: !inventoryId,
    });

  const { organization, setOrganization } = useOrganizationContext();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (inventoryOrgData) {
      const newOrgState = normalizeOrganizationState(inventoryOrgData);

      if (hasOrganizationChanged(organization, newOrgState)) {
        setOrganization(newOrgState);
      }
      setTheme((inventoryOrgData?.theme?.themeKey as string) || "blue_theme");
    }
  }, [
    isInventoryOrgDataLoading,
    inventoryOrgData,
    organization,
    setOrganization,
    setTheme,
  ]);

  return {
    inventoryOrgData,
    isInventoryOrgDataLoading,
  };
}
