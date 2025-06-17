"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { useGetOrganizationForInventoryQuery } from "@/services/api";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import ProgressLoader from "@/components/ProgressLoader";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";

export default function DataLayout({
  children,
  params: { lng, inventory },
}: {
  children: React.ReactNode;
  params: { lng: string; inventory: string };
}) {
  const { data: inventoryOrgData, isLoading: isInventoryOrgDataLoading } =
    useGetOrganizationForInventoryQuery(inventory, {
      skip: !inventory,
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
      setTheme(inventoryOrgData?.theme?.themeKey as string);
    }
  }, [isInventoryOrgDataLoading, inventoryOrgData]);

  if (isInventoryOrgDataLoading) {
    return <ProgressLoader />;
  }

  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <NavigationBar lng={lng} isPublic={true} />
      <Toaster />
      <div className="w-full h-full">{children}</div>
    </Box>
  );
}
