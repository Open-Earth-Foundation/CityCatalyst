import { useGetOrganizationForInventoryQuery } from "@/services/api";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
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
      const logoUrl = inventoryOrgData?.logoUrl ?? null;
      const active = inventoryOrgData?.active ?? true;

      if (
        organization?.logoUrl !== logoUrl ||
        organization?.active !== active
      ) {
        setOrganization({ logoUrl, active });
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
