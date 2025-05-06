"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { useGetOrganizationForInventoryQuery } from "@/services/api";
import { useLogo } from "@/hooks/logo-provider/use-logo-provider";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import ProgressLoader from "@/components/ProgressLoader";

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

  const { setLogoUrl } = useLogo();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (inventoryOrgData) {
      setLogoUrl(inventoryOrgData?.logoUrl as string);
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
